import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { transcribe, translateToEnglish } from '@/server/asr';
import { ensureEmbedding } from '@/server/embeddings';
import { truncatePayload } from '@/server/lib/retry';
import { SSEManager } from '@/lib/sse';
import { withRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.JOBS_SECRET}`)
    return NextResponse.json({ ok: false }, { status: 401 });

  const { callId, recordingUrl } = await req.json();
  
  // Load call with duration and recording
  const call = await db.oneOrNone(`
    select id, duration_sec, recording_url 
    from calls 
    where id=$1
  `, [callId]);
  
  if (!call) {
    return NextResponse.json({ ok: false, error: 'call_not_found' }, { status: 404 });
  }
  
  // Check duration >= 3s (lowered from 10s to allow rejection analysis)
  if (!call.duration_sec || call.duration_sec < 3) {
    await db.none(`insert into call_events(call_id, type, payload) values($1, 'ultra_short_call_skipped', $2)`,
      [callId, { duration_sec: call.duration_sec || 0 }]);
    return NextResponse.json({ ok: false, error: 'ultra_short_call' });
  }
  
  // Check recording URL present
  const url = recordingUrl || call.recording_url;
  if (!url) {
    await db.none(`insert into call_events(call_id, type, payload) values($1, 'no_recording', $2)`, 
      [callId, { error: 'Recording URL not provided' }]);
    return NextResponse.json({ ok: false, error: 'no_recording' });
  }
  
  // Check if already transcribed
  const existing = await db.oneOrNone(`select call_id from transcripts where call_id=$1`, [callId]);
  if (existing) {
    await db.none(`insert into call_events(call_id, type, payload) values($1, 'transcribe_skipped', $2)`, 
      [callId, { reason: 'already_exists' }]);
    return NextResponse.json({ ok: true, status: 'exists' });
  }

  try {
    // Send SSE update: transcribing
    SSEManager.sendStatus(callId, 'transcribing', { engine: 'starting' });
    
    // Use new ASR service layer
    const result = await transcribe(url);
    
    // Translate if needed
    let translatedText = result.translated_text;
    if (!translatedText && result.lang !== 'en') {
      translatedText = await translateToEnglish(result.text, result.lang);
    }
    
    // Store transcript with all metadata
    await db.none(`
      insert into transcripts(call_id, engine, lang, text, translated_text, redacted, diarized, words, created_at)
      values($1, $2, $3, $4, $5, $4, $6, $7, now())
      on conflict (call_id) do update set
        engine=$2, lang=$3, text=$4, translated_text=$5, redacted=$4,
        diarized=$6, words=$7, created_at=now()
    `, [
      callId,
      result.engine,
      result.lang,
      result.text,
      translatedText || result.text,
      JSON.stringify(result.diarized || []),
      JSON.stringify(result.words || [])
    ]);

    // NEW: Save call quality metrics for filtering
    const { saveQualityMetrics } = await import('@/server/lib/call-quality-classifier');
    await saveQualityMetrics(
      callId,
      result.text,
      result.diarized || [],
      call.duration_sec,
      1.0 // Default confidence score
    );

    await db.none(`insert into call_events(call_id, type, payload) values($1, 'transcribe_ok', $2)`, 
      [callId, { 
        engine: result.engine, 
        lang: result.lang, 
        chars: result.text.length,
        words_count: result.words?.length || 0
      }]);

    // Generate embedding for search
    let embeddingCreated = false;
    try {
      await ensureEmbedding(callId);
      embeddingCreated = true;
    } catch (embedError: any) {
      console.error('Embedding generation failed:', embedError);
      await db.none(`insert into call_events(call_id, type, payload) values($1, 'embedding_error', $2)`, 
        [callId, truncatePayload({ error: embedError.message })]);
    }

    // Check if this is a compliance-only agency
    const agencyInfo = await db.oneOrNone(`
      SELECT a.id as agency_id, a.product_type
      FROM calls c
      LEFT JOIN agencies a ON a.id = c.agency_id
      WHERE c.id = $1
    `, [callId]);

    const isComplianceOnly = agencyInfo?.product_type === 'compliance_only';

    // Trigger analysis
    let analyzeOk = false;
    let analyzeData: any = {};

    if (isComplianceOnly) {
      // For compliance-only customers, skip expensive full analysis
      // Instead, automatically extract post-close segment and analyze compliance
      try {
        SSEManager.sendStatus(callId, 'analyzing', { stage: 'compliance_only' });

        const { extractPostCloseSegment, analyzeCompliance } = await import('@/lib/post-close-analysis');

        // Extract post-close segment
        const segment = await extractPostCloseSegment(callId);

        if (segment) {
          // Get active script for this agency
          const activeScript = await db.oneOrNone(`
            SELECT id FROM post_close_scripts
            WHERE agency_id = $1 AND active = true
            ORDER BY created_at DESC
            LIMIT 1
          `, [agencyInfo.agency_id]);

          if (activeScript) {
            // Run compliance analysis
            const complianceResult = await analyzeCompliance(segment.transcript, activeScript.id);

            // Store result
            await db.none(`
              INSERT INTO post_close_compliance (
                segment_id, script_id, call_id, agency_id,
                overall_score, compliance_passed, word_match_percentage,
                phrase_match_percentage, sequence_score, missing_phrases,
                paraphrased_sections, sequence_errors, extra_content,
                levenshtein_distance, similarity_score, flagged_for_review,
                flag_reasons, agent_name
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            `, [
              segment.id, activeScript.id, callId, agencyInfo.agency_id,
              complianceResult.overall_score, complianceResult.compliance_passed,
              complianceResult.word_match_percentage, complianceResult.phrase_match_percentage,
              complianceResult.sequence_score, complianceResult.missing_phrases,
              JSON.stringify(complianceResult.paraphrased_sections),
              JSON.stringify(complianceResult.sequence_errors),
              complianceResult.extra_content, complianceResult.levenshtein_distance,
              complianceResult.similarity_score, complianceResult.flagged_for_review,
              complianceResult.flag_reasons, segment.agent_name
            ]);

            analyzeOk = true;
            analyzeData = {
              compliance_score: complianceResult.overall_score,
              compliance_passed: complianceResult.compliance_passed
            };
          }
        }

        await db.none(`insert into call_events(call_id, type, payload) values($1, 'compliance_analysis_completed', $2)`,
          [callId, { segment_extracted: !!segment, analyzed: analyzeOk }]);

      } catch (complianceError: any) {
        console.error('Compliance analysis failed:', complianceError);
        await db.none(`insert into call_events(call_id, type, payload) values($1, 'compliance_analysis_error', $2)`,
          [callId, truncatePayload({ error: complianceError.message })]);
      }
    } else {
      // Full analysis for regular customers
      try {
        // Send SSE update: analyzing
        SSEManager.sendStatus(callId, 'analyzing', { stage: 'starting' });

        const analyzeResp = await fetch(`${process.env.APP_URL}/api/jobs/analyze`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.JOBS_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId })
        });

        if (analyzeResp.ok) {
          analyzeOk = true;
          const data = await analyzeResp.json();
          analyzeData = {
            qa_score: data.qa_score,
            reason_primary: data.reason_primary
          };
        } else {
          const errorText = await analyzeResp.text();
          await db.none(`insert into call_events(call_id, type, payload) values($1, 'analyze_error', $2)`,
            [callId, truncatePayload({ status: analyzeResp.status, error: errorText })]);
        }
      } catch (analyzeError: any) {
        console.error('Analysis trigger failed:', analyzeError);
        await db.none(`insert into call_events(call_id, type, payload) values($1, 'analyze_error', $2)`,
          [callId, truncatePayload({ error: analyzeError.message })]);
      }
    }

    // Send final SSE status
    SSEManager.sendStatus(callId, 'done', { 
      transcribed: true, 
      analyzed: analyzeOk,
      engine: result.engine,
      lang: result.lang
    });

    return NextResponse.json({ 
      ok: true, 
      engine: result.engine,
      lang: result.lang,
      embedding: embeddingCreated,
      analyze_ok: analyzeOk,
      ...analyzeData
    });
  } catch (error: any) {
    await db.none(`insert into call_events(call_id, type, payload) values($1, 'transcribe_error', $2)`, 
      [callId, truncatePayload({ 
        error: error.message,
        stack: error.stack?.substring(0, 500)
      })]);
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }
}

export const POST = withRateLimit(handler, { endpoint: 'transcribe' });
