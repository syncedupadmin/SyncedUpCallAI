import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { ANALYSIS_SCHEMA, validateAnalysis, softValidateAnalysis } from '@/server/lib/json-guard';
import { ANALYSIS_SYSTEM, userPrompt } from '@/server/lib/prompts';
import { alert } from '@/server/lib/alerts';
import { withinCancelWindow } from '@/server/lib/biz';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.JOBS_SECRET}`)
    return NextResponse.json({ ok: false }, { status: 401 });

  const { callId } = await req.json();
  
  // Check if already analyzed
  const existing = await db.oneOrNone(`select call_id from analyses where call_id=$1`, [callId]);
  if (existing) {
    await db.none(`insert into call_events(call_id, type, payload) values($1, 'analysis_skipped', $2)`, 
      [callId, { reason: 'already_exists' }]);
    return NextResponse.json({ ok: true, skipped: 'exists' });
  }
  
  const row = await db.oneOrNone(`
    select c.*,
           t.text,
           t.translated_text,
           t.lang,
           t.redacted,
           t.diarized,
           ct.primary_phone,
           ag.name as agent_name
    from calls c
    join transcripts t on t.call_id=c.id
    left join contacts ct on ct.id = c.contact_id
    left join agents ag on ag.id = c.agent_id
    where c.id=$1
  `, [callId]);
  if (!row) return NextResponse.json({ ok: false, error: 'no_transcript' }, { status: 404 });
  
  // Import rejection analyzer for short calls
  const { analyzeRejectionCall, saveRejectionAnalysis, updateAgentRejectionMetrics, REJECTION_ANALYSIS_PROMPT } = await import('@/server/lib/rejection-analyzer');

  // Import quality classifier
  const { shouldAnalyzeCall, saveQualityMetrics } = await import('@/server/lib/call-quality-classifier');

  // Check if this is a short rejection call (3-30 seconds)
  const isShortRejectionCall = row.duration_sec && row.duration_sec >= 3 && row.duration_sec < 30;

  // Skip only very short calls (< 3 seconds)
  if (row.duration_sec && row.duration_sec < 3) {
    await db.none(`insert into call_events(call_id, type, payload) values($1, 'ultra_short_call_skipped', $2)`,
      [callId, { duration_sec: row.duration_sec }]);
    return NextResponse.json({ ok: false, error: 'ultra_short_call' });
  }

  // Use translated text if available, otherwise original
  const textToAnalyze = row.translated_text || row.text;

  // NEW: Check call quality and filter out useless calls
  await saveQualityMetrics(
    callId,
    textToAnalyze,
    row.diarized || [],
    row.duration_sec,
    1.0 // ASR confidence (would be from actual ASR service)
  );

  const qualityCheck = await shouldAnalyzeCall(callId);

  if (!qualityCheck.should_analyze) {
    // Log filtered call
    await db.none(`
      INSERT INTO call_events(call_id, type, payload)
      VALUES($1, 'analysis_filtered', $2)
    `, [callId, {
      classification: qualityCheck.classification,
      reason: qualityCheck.reason,
      duration_sec: row.duration_sec
    }]);

    // Create minimal analysis record for consistency
    await db.none(`
      INSERT INTO analyses(call_id, reason_primary, summary, prompt_ver, model, confidence)
      VALUES($1, $2, $3, 0, 'filtered', 0.1)
      ON CONFLICT (call_id) DO UPDATE SET
        reason_primary = $2,
        summary = $3,
        model = 'filtered'
    `, [
      callId,
      qualityCheck.classification,
      `Call filtered: ${qualityCheck.reason}`
    ]);

    return NextResponse.json({
      ok: true,
      filtered: true,
      classification: qualityCheck.classification,
      reason: qualityCheck.reason
    });
  }

  const meta = {
    agent_id: row.agent_id,
    agent_name: row.agent_name,
    campaign: row.campaign,
    direction: row.direction,
    disposition: row.disposition,
    duration_sec: row.duration_sec,
    sale_time: row.sale_time
  };

  // Handle short rejection calls differently (3-30 seconds)
  if (isShortRejectionCall) {
    try {
      // Perform rejection-specific analysis
      const rejectionAnalysis = await analyzeRejectionCall({
        id: callId,
        duration_sec: row.duration_sec,
        transcript: textToAnalyze,
        diarized: row.diarized,
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        campaign: row.campaign,
        disposition: row.disposition
      });

      // Save rejection analysis
      await saveRejectionAnalysis(callId, rejectionAnalysis, {
        id: callId,
        duration_sec: row.duration_sec,
        transcript: textToAnalyze,
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        campaign: row.campaign,
        disposition: row.disposition
      });

      // Update agent metrics
      if (row.agent_id) {
        await updateAgentRejectionMetrics(row.agent_id, row.agent_name);
      }

      // Also create a simplified analysis record for consistency
      const simplifiedAnalysis = {
        reason_primary: rejectionAnalysis.rejection_type || 'rejected_immediately',
        reason_secondary: rejectionAnalysis.rejection_severity,
        confidence: 0.9,
        qa_score: Math.round((rejectionAnalysis.professionalism_score + rejectionAnalysis.script_compliance_score) / 2),
        script_adherence: rejectionAnalysis.script_compliance_score,
        summary: `Short rejection call (${row.duration_sec}s). ${rejectionAnalysis.rejection_detected ? 'Rejection detected.' : ''} ${rejectionAnalysis.rebuttal_attempted ? 'Rebuttal attempted.' : 'No rebuttal attempted.'} ${rejectionAnalysis.led_to_pitch ? 'Led to pitch.' : 'Call ended quickly.'}`,
        risk_flags: rejectionAnalysis.rebuttal_attempted ? [] : ['no_rebuttal_attempted']
      };

      await db.none(`
        insert into analyses(call_id, reason_primary, reason_secondary, confidence, qa_score, script_adherence,
                             summary, prompt_ver, model, risk_flags)
        values($1,$2,$3,$4,$5,$6,$7,3,'rejection-analyzer',$8)
        on conflict (call_id) do update set
          reason_primary=$2, reason_secondary=$3, confidence=$4, qa_score=$5, script_adherence=$6,
          summary=$7, model='rejection-analyzer', risk_flags=$8
      `, [callId, simplifiedAnalysis.reason_primary, simplifiedAnalysis.reason_secondary,
          simplifiedAnalysis.confidence, simplifiedAnalysis.qa_score, simplifiedAnalysis.script_adherence,
          simplifiedAnalysis.summary, simplifiedAnalysis.risk_flags]);

      await db.none(`insert into call_events(call_id,type,payload) values($1,'rejection_analyzed',$2)`,
        [callId, rejectionAnalysis]);

      return NextResponse.json({
        ok: true,
        created: true,
        model: 'rejection-analyzer',
        qa_score: simplifiedAnalysis.qa_score,
        reason_primary: simplifiedAnalysis.reason_primary,
        rejection_analysis: rejectionAnalysis
      });
    } catch (rejectionError) {
      console.error('Rejection analysis failed:', rejectionError);
      // Fall through to regular analysis as fallback
    }
  }

  // OpenAI primary (for non-rejection or longer calls)
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Authorization': `Bearer ${process.env.OPENAI_API_KEY!}`, 'Content-Type':'application/json' },
    body: JSON.stringify({
      model:'gpt-4o-mini',
      temperature:0.2,
      messages:[{ role:'system', content: ANALYSIS_SYSTEM }, { role:'user', content: userPrompt(meta, textToAnalyze) }],
      response_format:{ type:'json_object' }
    })
  });
  let j: any = null;
  let model = 'gpt-4o-mini';
  let tokenInput = 0;
  let tokenOutput = 0;
  
  if (r.ok) {
    const out = await r.json();
    try { 
      j = JSON.parse(out.choices[0].message.content); 
      tokenInput = out.usage?.prompt_tokens || 0;
      tokenOutput = out.usage?.completion_tokens || 0;
    } catch { j = null; }
  }
  
  // Debug logging helper
  const shouldLog = process.env.NODE_ENV !== 'production' || process.env.DEBUG_ANALYSIS === '1';

  // Try Anthropic fallback if OpenAI failed or invalid
  let isValid = false;
  let validationErrors: any = null;

  if (r.ok && j) {
    isValid = validateAnalysis(j);
    if (!isValid && shouldLog) {
      validationErrors = (validateAnalysis as any).errors;
      console.log(`analyze.validate.failed call_id=${callId}`);
      console.log('Raw response (first 500 chars):', JSON.stringify(j).substring(0, 500));
      console.log('Validation errors:', JSON.stringify(validationErrors));
    }
  }

  if (!r.ok || !j || !isValid) {
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 2000,
            temperature: 0.2,
            system: ANALYSIS_SYSTEM,
            messages: [{
              role: 'user',
              content: userPrompt(meta, textToAnalyze)
            }]
          })
        });

        if (anthropicResp.ok) {
          const anthropicOut = await anthropicResp.json();
          try {
            j = JSON.parse(anthropicOut.content[0].text);
            model = 'claude-3.5-sonnet';
            tokenInput = anthropicOut.usage?.input_tokens || 0;
            tokenOutput = anthropicOut.usage?.output_tokens || 0;
            isValid = validateAnalysis(j);
          } catch { j = null; }
        }
      } catch (anthError) {
        console.error('Anthropic fallback failed:', anthError);
      }
    }
  }

  // If still invalid, try soft validation
  if (!isValid && j) {
    const softResult = softValidateAnalysis(j);
    if (softResult.valid && softResult.data) {
      if (shouldLog) {
        console.log(`analyze.soft_validate.success call_id=${callId}`);
      }
      j = softResult.data;
      isValid = true;
    }
  }

  if (!j || !isValid) {
    await db.none(`insert into call_events(call_id,type,payload) values($1,'analysis_failed',$2)`,
      [callId, { error: 'Schema validation failed', hint: j ? 'Invalid structure' : 'No response', logged: shouldLog }]);
    return NextResponse.json({
      ok: false,
      error: 'schema_invalid',
      hint: !j ? 'No response from model' : 'Summary missing or invalid structure',
      logged: shouldLog
    }, { status: 422 });
  }

  await db.none(`
    insert into analyses(call_id, reason_primary, reason_secondary, confidence, qa_score, script_adherence,
                         sentiment_agent, sentiment_customer, risk_flags, actions, key_quotes, summary, prompt_ver, model, token_input, token_output)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,2,$13,$14,$15)
    on conflict (call_id) do update set
      reason_primary=$2, reason_secondary=$3, confidence=$4, qa_score=$5, script_adherence=$6,
      sentiment_agent=$7, sentiment_customer=$8, risk_flags=$9, actions=$10, key_quotes=$11, summary=$12, model=$13
  `, [callId, j.reason_primary, (j as any).reason_secondary||null, j.confidence, j.qa_score, j.script_adherence,
      (j as any).sentiment_agent||null, (j as any).sentiment_customer||null, (j as any).risk_flags||[], (j as any).actions||[], JSON.stringify((j as any).key_quotes||[]), j.summary,
      model, tokenInput, tokenOutput]);

  // Simple at-risk flag based on your rule
  const riskEasy = ((j.reason_primary === 'bank_decline' || j.reason_primary == 'trust_scam_fear' || j.reason_primary == 'spouse_approval') && (j.qa_score || 0) < 60) && 1 || 0
  await db.none(`
    update analyses set risk_flags = coalesce(risk_flags,'{}') || case when $2=1 then '{at_risk_easy}'::text[] else '{}'::text[] end
    where call_id = $1
  `, [callId, riskEasy]);

  await db.none(`insert into call_events(call_id,type,payload) values($1,'analyzed',$2)`, [callId, j]);
  
  // Generate embedding if not exists
  try {
    const { ensureEmbedding } = await import('@/server/embeddings');
    await ensureEmbedding(callId);
  } catch (embedError) {
    console.error('Embedding generation failed:', embedError);
  }
  
  // Check for alerts
  const policy = await db.oneOrNone(`
    select premium from policies_stub 
    where contact_id = $1 and status = 'active'
    order by premium desc 
    limit 1
  `, [row.contact_id]);
  
  const premium = policy?.premium || 0;
  
  // Same-day cancel alert
  if (withinCancelWindow(row.started_at) && 
      (row.disposition === 'Cancelled' || j.reason_primary === 'requested_cancel')) {
    await alert('same_day_cancel', {
      agent: row.agent_name,
      phone: row.primary_phone,
      duration_sec: row.duration_sec,
      premium
    });
  }
  
  // High-value at risk alert
  const riskReasons = ['bank_decline', 'trust_scam_fear', 'benefits_confusion', 'already_covered', 
                       'agent_miscommunication', 'followup_never_received', 'requested_callback', 'other'];
  if (premium >= 300 && riskReasons.includes(j.reason_primary)) {
    await alert('high_value_risk', {
      reason: j.reason_primary,
      agent: row.agent_name,
      phone: row.primary_phone,
      premium
    });
  }
  
  // Check for high-risk calls and send alerts
  try {
    const { processHighRiskCall } = await import('@/server/lib/rules');
    await processHighRiskCall(callId, j);
  } catch (riskError) {
    console.error('High-risk check failed:', riskError);
  }
  
  return NextResponse.json({
    ok: true,
    created: true,
    model,
    qa_score: j.qa_score,
    reason_primary: j.reason_primary
  });
}
