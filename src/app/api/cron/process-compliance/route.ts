/**
 * Cron Job: Process Post-Close Compliance
 * Runs every 5 minutes to:
 * 1. Sync sales calls from Convoso for agencies with credentials
 * 2. Extract post-close segments from completed sales calls
 * 3. Run compliance analysis against active scripts
 * 4. Store results and update agent performance metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { extractPostCloseSegment, analyzeCompliance, getActiveScript } from '@/lib/post-close-analysis';
import { sendComplianceAlert } from '@/lib/compliance-notifications';
import { processAllAgencyCompliance } from '@/lib/compliance-convoso';
import { logInfo, logError } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logInfo({
      event_type: 'compliance_cron_started',
      timestamp: new Date().toISOString()
    });

    const results = {
      convoso_synced: 0,
      segments_extracted: 0,
      segments_failed: 0,
      compliance_analyzed: 0,
      compliance_failed: 0,
      total_processed: 0,
      errors: [] as string[]
    };

    // ============================================
    // STEP 0: Sync from Convoso (2-part workflow)
    // ============================================

    try {
      // Process all agencies with Convoso credentials
      await processAllAgencyCompliance();

      // Count newly synced segments
      const synced = await db.oneOrNone(`
        SELECT COUNT(*) as count
        FROM post_close_segments
        WHERE convoso_sync_at >= NOW() - INTERVAL '5 minutes'
      `);

      results.convoso_synced = synced?.count || 0;

      logInfo({
        event_type: 'convoso_sync_completed',
        segments_synced: results.convoso_synced
      });

    } catch (error: any) {
      logInfo({
        event_type: 'convoso_sync_failed',
        error: error.message
      });
      results.errors.push(`Convoso sync failed: ${error.message}`);
    }

    // ============================================
    // STEP 1: Extract Post-Close Segments
    // ============================================

    // Find sales calls that need segment extraction (last 7 days)
    // Now includes calls marked as compliance_required from Convoso sync
    const callsNeedingExtraction = await db.manyOrNone(`
      SELECT
        c.id,
        c.agency_id,
        c.agent_name,
        c.disposition,
        c.convoso_disposition,
        c.duration_sec,
        c.campaign,
        c.convoso_agent_id,
        c.product_type,
        c.state,
        t.text as transcript_text,
        t.words
      FROM calls c
      INNER JOIN transcripts t ON t.call_id = c.id
      LEFT JOIN post_close_segments pcs ON pcs.call_id = c.id
      WHERE (
        c.disposition = 'SALE'
        OR c.convoso_disposition = 'SALE'
        OR c.compliance_required = true
      )
      AND c.duration_sec >= 60
      AND c.created_at >= NOW() - INTERVAL '7 days'
      AND t.text IS NOT NULL
      AND pcs.id IS NULL
      AND c.agency_id IS NOT NULL
      AND (c.compliance_processed = false OR c.compliance_processed IS NULL)
      LIMIT 50
    `);

    logInfo({
      event_type: 'calls_needing_extraction',
      count: callsNeedingExtraction.length
    });

    // Process each call for segment extraction
    for (const call of callsNeedingExtraction) {
      try {
        // Extract post-close segment (after card collection)
        const segment = await extractPostCloseSegmentWithAgency(call);

        if (segment) {
          results.segments_extracted++;

          // Mark call as compliance processed if it came from Convoso
          if (call.compliance_required) {
            await db.none(`
              UPDATE calls
              SET compliance_processed = true
              WHERE id = $1
            `, [call.id]);
          }

          logInfo({
            event_type: 'segment_extracted',
            call_id: call.id,
            segment_id: segment.id,
            agency_id: call.agency_id,
            convoso_agent_id: call.convoso_agent_id
          });
        }
      } catch (error: any) {
        results.segments_failed++;
        results.errors.push(`Segment extraction failed for call ${call.id}: ${error.message}`);
        logError('Segment extraction failed', error, { call_id: call.id });
      }
    }

    // ============================================
    // STEP 2: Run Compliance Analysis
    // ============================================

    // Find segments that need compliance analysis
    const segmentsNeedingAnalysis = await db.manyOrNone(`
      SELECT
        pcs.*,
        c.agency_id,
        c.product_type,
        c.state
      FROM post_close_segments pcs
      INNER JOIN calls c ON c.id = pcs.call_id
      LEFT JOIN post_close_compliance pcc ON pcc.segment_id = pcs.id
      WHERE pcc.id IS NULL
      AND pcs.agency_id IS NOT NULL
      AND pcs.created_at >= NOW() - INTERVAL '7 days'
      LIMIT 50
    `);

    logInfo({
      event_type: 'segments_needing_analysis',
      count: segmentsNeedingAnalysis.length
    });

    // Process each segment for compliance analysis
    for (const segment of segmentsNeedingAnalysis) {
      try {
        // Get the active script for this agency/product/state
        const script = await getActiveScript(
          segment.product_type,
          segment.state,
          segment.agency_id
        );

        if (!script) {
          logInfo({
            event_type: 'no_active_script',
            segment_id: segment.id,
            agency_id: segment.agency_id,
            product_type: segment.product_type,
            state: segment.state
          });
          continue;
        }

        // Run compliance analysis
        const complianceResult = await analyzeCompliance(segment.transcript, script.id);

        // Store compliance results with agency_id
        await db.none(`
          INSERT INTO post_close_compliance (
            segment_id,
            script_id,
            call_id,
            agency_id,
            overall_score,
            compliance_passed,
            word_match_percentage,
            phrase_match_percentage,
            sequence_score,
            missing_phrases,
            paraphrased_sections,
            sequence_errors,
            extra_content,
            levenshtein_distance,
            similarity_score,
            flagged_for_review,
            flag_reasons,
            agent_name
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `, [
          segment.id,
          script.id,
          segment.call_id,
          segment.agency_id,
          complianceResult.overall_score,
          complianceResult.compliance_passed,
          complianceResult.word_match_percentage,
          complianceResult.phrase_match_percentage,
          complianceResult.sequence_score,
          complianceResult.missing_phrases,
          JSON.stringify(complianceResult.paraphrased_sections),
          JSON.stringify(complianceResult.sequence_errors),
          complianceResult.extra_content,
          complianceResult.levenshtein_distance,
          complianceResult.similarity_score,
          complianceResult.flagged_for_review,
          complianceResult.flag_reasons,
          segment.agent_name
        ]);

        results.compliance_analyzed++;

        logInfo({
          event_type: 'compliance_analyzed',
          segment_id: segment.id,
          script_id: script.id,
          score: complianceResult.overall_score,
          passed: complianceResult.compliance_passed,
          flagged: complianceResult.flagged_for_review
        });

        // Send notification if flagged for review
        if (complianceResult.flagged_for_review && !complianceResult.compliance_passed) {
          await sendComplianceAlert({
            type: complianceResult.overall_score < 50 ? 'failure' : 'low_score',
            severity: complianceResult.overall_score < 50 ? 'high' :
                      complianceResult.overall_score < 70 ? 'medium' : 'low',
            agent_name: segment.agent_name || 'Unknown',
            agency_id: segment.agency_id,
            call_id: segment.call_id,
            score: complianceResult.overall_score,
            issues: complianceResult.flag_reasons || [],
            script_name: script.script_name || 'Unknown Script',
            timestamp: new Date()
          });
        }

      } catch (error: any) {
        results.compliance_failed++;
        results.errors.push(`Compliance analysis failed for segment ${segment.id}: ${error.message}`);
        logError('Compliance analysis failed', error, { segment_id: segment.id });
      }
    }

    // ============================================
    // STEP 3: Update Agent Performance Metrics
    // ============================================

    // Update daily performance for agents with new compliance results
    await updateAgentPerformanceMetrics();

    results.total_processed = results.segments_extracted + results.compliance_analyzed;

    logInfo({
      event_type: 'compliance_cron_completed',
      results
    });

    return NextResponse.json({
      success: true,
      message: 'Compliance processing completed',
      results
    });

  } catch (error: any) {
    logError('Compliance cron job failed', error);
    return NextResponse.json(
      { error: 'Compliance processing failed', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Extract post-close segment with agency context
 */
async function extractPostCloseSegmentWithAgency(call: any): Promise<any> {
  try {
    // Detect card collection timestamp from transcript
    let cardTimestamp: number | undefined;
    let segmentStart: number = 0;
    let segmentEnd: number = 0;
    let segmentText = '';

    if (call.words && Array.isArray(call.words)) {
      // Look for card-related keywords
      const cardPatterns = [
        /card.*number/i,
        /credit.*card/i,
        /debit.*card/i,
        /payment.*method/i,
        /billing.*information/i,
        /\b\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\b/, // Card number pattern
        /expiration/i,
        /cvv/i,
        /security.*code/i
      ];

      // Find the last occurrence of card-related content
      for (let i = call.words.length - 1; i >= 0; i--) {
        const word = call.words[i];
        if (cardPatterns.some(p => p.test(word.word))) {
          cardTimestamp = word.end;
          break;
        }
      }

      if (cardTimestamp) {
        // Extract everything after card collection
        segmentStart = cardTimestamp;
        segmentEnd = call.duration_sec * 1000;
        const segmentWords = call.words.filter((w: any) => w.start >= segmentStart);
        segmentText = segmentWords.map((w: any) => w.word).join(' ');
      }
    }

    // Fallback: extract last 90 seconds if no card timestamp found
    if (!segmentText || segmentText.length < 100) {
      const totalDurationMs = call.duration_sec * 1000;
      segmentStart = Math.max(0, totalDurationMs - 90000);
      segmentEnd = totalDurationMs;

      if (call.words && Array.isArray(call.words)) {
        const segmentWords = call.words.filter((w: any) =>
          w.start >= segmentStart && w.end <= segmentEnd
        );
        segmentText = segmentWords.map((w: any) => w.word).join(' ');
      } else {
        // Extract from transcript text (estimate)
        const words = call.transcript_text.split(' ');
        const wordsPerSecond = words.length / call.duration_sec;
        const startWordIndex = Math.max(0, words.length - Math.round(wordsPerSecond * 90));
        segmentText = words.slice(startWordIndex).join(' ');
      }
    }

    // Skip if segment is too short
    if (!segmentText || segmentText.length < 100) {
      logInfo({
        event_type: 'segment_too_short',
        call_id: call.id,
        segment_length: segmentText?.length || 0
      });
      return null;
    }

    // Store the segment with agency_id and Convoso metadata
    const segment = await db.one(`
      INSERT INTO post_close_segments (
        call_id,
        agency_id,
        start_ms,
        end_ms,
        duration_sec,
        transcript,
        words,
        card_collection_timestamp_ms,
        sale_confirmed,
        disposition,
        agent_name,
        campaign,
        convoso_agent_id,
        convoso_disposition,
        extraction_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      call.id,
      call.agency_id,
      segmentStart,
      segmentEnd,
      Math.round((segmentEnd - segmentStart) / 1000),
      segmentText,
      JSON.stringify(call.words?.filter((w: any) => w.start >= segmentStart) || []),
      cardTimestamp,
      call.disposition === 'SALE' || call.convoso_disposition === 'SALE',
      call.disposition || call.convoso_disposition,
      call.agent_name,
      call.campaign,
      call.convoso_agent_id,
      call.convoso_disposition,
      call.convoso_agent_id ? 'convoso_compliance' : 'auto'
    ]);

    return segment;

  } catch (error: any) {
    logError('Failed to extract segment with agency', error, { call_id: call.id });
    throw error;
  }
}

/**
 * Update agent performance metrics
 */
async function updateAgentPerformanceMetrics(): Promise<void> {
  try {
    // Calculate today's performance for all agents with new results
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await db.none(`
      INSERT INTO agent_post_close_performance (
        agent_name,
        agency_id,
        period_start,
        period_end,
        total_analyzed,
        total_passed,
        total_failed,
        pass_rate,
        avg_compliance_score,
        avg_word_match_percentage,
        avg_phrase_match_percentage,
        flagged_count,
        most_used_script_id
      )
      SELECT
        pc.agent_name,
        pc.agency_id,
        $1::date as period_start,
        $1::date as period_end,
        COUNT(*) as total_analyzed,
        SUM(CASE WHEN pc.compliance_passed THEN 1 ELSE 0 END) as total_passed,
        SUM(CASE WHEN NOT pc.compliance_passed THEN 1 ELSE 0 END) as total_failed,
        AVG(CASE WHEN pc.compliance_passed THEN 100 ELSE 0 END) as pass_rate,
        AVG(pc.overall_score) as avg_compliance_score,
        AVG(pc.word_match_percentage) as avg_word_match_percentage,
        AVG(pc.phrase_match_percentage) as avg_phrase_match_percentage,
        SUM(CASE WHEN pc.flagged_for_review THEN 1 ELSE 0 END) as flagged_count,
        MODE() WITHIN GROUP (ORDER BY pc.script_id) as most_used_script_id
      FROM post_close_compliance pc
      WHERE pc.analyzed_at >= $1
      AND pc.analyzed_at < $1::date + INTERVAL '1 day'
      AND pc.agent_name IS NOT NULL
      AND pc.agency_id IS NOT NULL
      GROUP BY pc.agent_name, pc.agency_id
      ON CONFLICT (agency_id, agent_name, period_start, period_end)
      DO UPDATE SET
        total_analyzed = EXCLUDED.total_analyzed,
        total_passed = EXCLUDED.total_passed,
        total_failed = EXCLUDED.total_failed,
        pass_rate = EXCLUDED.pass_rate,
        avg_compliance_score = EXCLUDED.avg_compliance_score,
        avg_word_match_percentage = EXCLUDED.avg_word_match_percentage,
        avg_phrase_match_percentage = EXCLUDED.avg_phrase_match_percentage,
        flagged_count = EXCLUDED.flagged_count,
        most_used_script_id = EXCLUDED.most_used_script_id,
        updated_at = NOW()
    `, [today]);

    logInfo({
      event_type: 'agent_performance_updated',
      date: today.toISOString()
    });

  } catch (error: any) {
    logError('Failed to update agent performance', error);
  }
}

