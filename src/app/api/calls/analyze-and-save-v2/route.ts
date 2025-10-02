/**
 * API Route: /api/calls/analyze-and-save-v2
 *
 * Production endpoint for 3-pass analysis with proper data routing:
 * - Opening analysis → opening_segments table
 * - Post-close compliance → post_close_compliance table
 * - Main analysis → calls table (analysis_data field)
 *
 * This ensures the v2 system properly separates concerns and stores data
 * in the correct database tables.
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeCallV2 } from '@/lib/unified-analysis-v2';
import { logInfo, logError } from '@/lib/log';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/server/db';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await request.json();
    const { call_id, audioUrl, meta } = body;

    if (!call_id) {
      return NextResponse.json(
        { error: 'call_id is required' },
        { status: 400 }
      );
    }

    if (!audioUrl) {
      return NextResponse.json(
        { error: 'audioUrl is required' },
        { status: 400 }
      );
    }

    logInfo({
      event_type: 'analyze_and_save_v2_started',
      call_id,
      audio_url: audioUrl
    });

    // Run 3-pass analysis
    const result = await analyzeCallV2(audioUrl, { ...meta, call_id }, undefined);

    // 1. SAVE OPENING ANALYSIS → opening_segments table
    if (result.opening_analysis && result.pass1_extraction?.opening_segment) {
      const openingSegment = result.pass1_extraction.opening_segment;
      const openingAnalysis = result.opening_analysis;

      const { error: openingError } = await supabase
        .from('opening_segments')
        .upsert({
          call_id,
          recording_url: audioUrl,
          start_ms: openingSegment.start_ms,
          end_ms: openingSegment.end_ms,
          transcript: openingSegment.text,
          pace_wpm: openingAnalysis.pace_wpm,
          greeting_type: openingAnalysis.greeting_type,
          company_mentioned: openingAnalysis.company_mentioned,
          agent_name_mentioned: openingAnalysis.agent_name_mentioned,
          value_prop_mentioned: openingAnalysis.value_prop_mentioned,
          question_asked: openingAnalysis.question_asked,
          success_score: openingAnalysis.opening_score,
          engagement_score: openingAnalysis.control_score,
          agent_name: meta?.agent_name || null,
          campaign: meta?.campaign || null,
          disposition: result.outcome,
          duration_sec: Math.floor((result.talk_metrics?.talk_time_agent_sec || 0) + (result.talk_metrics?.talk_time_customer_sec || 0)),
          call_continued: openingAnalysis.led_to_pitch,
          prospect_responded: true, // If we have analysis, they responded
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'call_id'
        });

      if (openingError) {
        logError('opening_segment_save_error', openingError, { call_id });
      } else {
        logInfo({ event_type: 'opening_segment_saved', call_id });
      }
    }

    // 2. SAVE POST-CLOSE COMPLIANCE → post_close_compliance table
    if (result.compliance_details) {
      const { error: complianceError } = await supabase
        .from('post_close_compliance')
        .insert({
          call_id,
          script_id: result.compliance_details.script_id || null,
          compliance_score: result.compliance_details.overall_score,
          compliance_passed: result.compliance_details.compliance_passed,
          word_match_percentage: result.compliance_details.word_match_percentage,
          phrase_match_percentage: result.compliance_details.phrase_match_percentage,
          sequence_score: result.compliance_details.sequence_score,
          similarity_score: result.compliance_details.similarity_score,
          levenshtein_distance: result.compliance_details.levenshtein_distance,
          missing_phrases: result.compliance_details.missing_phrases || [],
          extra_content: result.compliance_details.extra_content || [],
          flagged_for_review: result.compliance_details.flagged_for_review,
          flag_reasons: result.compliance_details.flag_reasons || [],
          paraphrased_sections: result.compliance_details.paraphrased_sections || [],
          sequence_errors: result.compliance_details.sequence_errors || [],
          agent_id: meta?.agent_id || null,
          agent_name: meta?.agent_name || null,
          created_at: new Date().toISOString()
        });

      if (complianceError) {
        logError('post_close_compliance_save_error', complianceError, { call_id });
      } else {
        logInfo({ event_type: 'post_close_compliance_saved', call_id });
      }
    }

    // 3. SAVE TRANSCRIPT → transcripts table
    await db.none(`
      INSERT INTO transcripts(call_id, engine, text, diarized, words)
      VALUES($1, $2, $3, $4, $5)
      ON CONFLICT (call_id) DO UPDATE SET
        engine = $2,
        text = $3,
        diarized = $4,
        words = $5
    `, [
      call_id,
      'deepgram-nova2',
      result.transcript,
      result.segments || [],
      result.segments || []
    ]);

    logInfo({ event_type: 'transcript_saved', call_id });

    // 4. SAVE MAIN ANALYSIS → analyses table
    const qaScore = result.opening_score || 0;
    const scriptAdherence = result.compliance_details?.compliance_passed ?
      result.compliance_details.overall_score : null;

    await db.none(`
      INSERT INTO analyses(
        call_id, reason_primary, reason_secondary, confidence,
        qa_score, script_adherence, summary, prompt_ver,
        model, risk_flags, key_quotes
      )
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (call_id) DO UPDATE SET
        reason_primary = $2,
        reason_secondary = $3,
        confidence = $4,
        qa_score = $5,
        script_adherence = $6,
        summary = $7,
        prompt_ver = $8,
        model = $9,
        risk_flags = $10,
        key_quotes = $11
    `, [
      call_id,
      result.outcome, // reason_primary
      result.reason, // reason_secondary
      0.95, // high confidence with strict JSON schemas
      qaScore,
      scriptAdherence,
      result.summary,
      4, // v2 prompt version
      'v2_3pass_sequential',
      result.red_flags || [],
      {
        opening_quality: result.opening_quality,
        opening_score: result.opening_score,
        compliance_status: result.compliance_status,
        customer_name: result.customer_name,
        monthly_premium: result.monthly_premium,
        enrollment_fee: result.enrollment_fee,
        policy_details: result.policy_details
      }
    ]);

    logInfo({ event_type: 'analysis_saved', call_id });

    // 5. SAVE METADATA → calls.metadata JSONB field
    await db.none(`
      UPDATE calls
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{v2_analysis}',
        $2::jsonb
      )
      WHERE id = $1
    `, [
      call_id,
      JSON.stringify({
        version: 'v2_3pass_sequential',
        opening_quality: result.opening_quality,
        opening_score: result.opening_score,
        compliance_status: result.compliance_status,
        talk_metrics: result.talk_metrics,
        analyzed_at: new Date().toISOString(),
        duration_ms: result.duration_ms
      })
    ]);

    logInfo({ event_type: 'call_metadata_updated', call_id });

    logInfo({
      event_type: 'analyze_and_save_v2_complete',
      call_id,
      outcome: result.outcome,
      opening_quality: result.opening_quality,
      compliance_status: result.compliance_status,
      duration_ms: result.duration_ms
    });

    return NextResponse.json({
      success: true,
      call_id,
      outcome: result.outcome,
      opening_quality: result.opening_quality,
      opening_score: result.opening_score,
      compliance_status: result.compliance_status,
      data: result
    });

  } catch (error: any) {
    logError('analyze_and_save_v2_error', error, {
      error_message: error.message
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Analysis and save failed',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
