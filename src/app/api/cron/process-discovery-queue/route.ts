import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { decryptConvosoCredentials } from '@/lib/crypto';
import {
  fetchRecordingUrl,
  analyzeCallWithOpenAI,
  type ConvosoCredentials
} from '@/lib/discovery/queue-processor';
import { transcribe } from '@/server/asr';
import { logInfo, logError } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

/**
 * Discovery Queue Processor Cron Job
 * Runs every minute to process pending discovery calls in background
 * Processes up to 100 calls per run to stay within timeout limits
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Validate cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find active discovery sessions (queued or processing)
    const { data: sessions, error: sessionsError } = await sbAdmin
      .from('discovery_sessions')
      .select('*')
      .in('status', ['queued', 'processing'])
      .order('started_at', { ascending: true })
      .limit(3); // Process up to 3 sessions concurrently

    if (sessionsError) {
      console.error('[Discovery Queue] Error fetching sessions:', sessionsError);
      throw sessionsError;
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({
        message: 'No active discovery sessions',
        processed: 0
      });
    }

    const results = {
      sessions_processed: 0,
      calls_processed: 0,
      calls_succeeded: 0,
      calls_failed: 0
    };

    for (const session of sessions) {
      try {
        results.sessions_processed++;

        console.log(`[Discovery Queue] Processing session ${session.id}`);

        // Get agency credentials
        const { data: agency, error: agencyError } = await sbAdmin
          .from('agencies')
          .select('convoso_credentials')
          .eq('id', session.agency_id)
          .single();

        if (agencyError || !agency?.convoso_credentials) {
          console.error(`[Discovery Queue] No credentials for session ${session.id}`);
          await sbAdmin
            .from('discovery_sessions')
            .update({
              status: 'error',
              error_message: 'Agency credentials not found'
            })
            .eq('id', session.id);
          continue;
        }

        const credentials: ConvosoCredentials = decryptConvosoCredentials(
          agency.convoso_credentials
        );

        // Get next batch of pending calls (100 per run for optimal speed)
        const { data: pendingCalls, error: callsError } = await sbAdmin
          .from('discovery_calls')
          .select('*')
          .eq('session_id', session.id)
          .eq('processing_status', 'pending')
          .order('created_at', { ascending: true })
          .limit(100);

        if (callsError) {
          console.error(`[Discovery Queue] Error fetching calls for session ${session.id}:`, callsError);
          continue;
        }

        if (!pendingCalls || pendingCalls.length === 0) {
          // All calls processed - finalize session
          console.log(`[Discovery Queue] No more pending calls for session ${session.id}, finalizing...`);
          await finalizeDiscoverySession(session.id);
          continue;
        }

        console.log(`[Discovery Queue] Processing ${pendingCalls.length} calls for session ${session.id}`);

        // Mark as processing
        const callIds = pendingCalls.map(c => c.id);
        await sbAdmin
          .from('discovery_calls')
          .update({ processing_status: 'processing' })
          .in('id', callIds);

        // Update session status to processing if it's still queued
        if (session.status === 'queued') {
          await sbAdmin
            .from('discovery_sessions')
            .update({ status: 'processing' })
            .eq('id', session.id);
        }

        // Process calls in parallel
        const processPromises = pendingCalls.map(call =>
          processDiscoveryCall(call, credentials, session.id)
        );

        const processResults = await Promise.allSettled(processPromises);

        // Count successes/failures
        processResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            results.calls_succeeded++;
          } else {
            results.calls_failed++;
          }
          results.calls_processed++;
        });

        // Log batch summary
        const successRate = results.calls_processed > 0
          ? Math.round((results.calls_succeeded / results.calls_processed) * 100)
          : 0;
        console.log(`[Discovery Queue] Session ${session.id} batch complete:`, {
          processed: results.calls_processed,
          succeeded: results.calls_succeeded,
          failed: results.calls_failed,
          successRate: `${successRate}%`
        });

        // Query and log failure reasons
        const { data: failureAnalysis } = await sbAdmin
          .from('discovery_calls')
          .select('error_message')
          .eq('session_id', session.id)
          .eq('processing_status', 'failed')
          .limit(50);

        if (failureAnalysis && failureAnalysis.length > 0) {
          const errorSummary = failureAnalysis.reduce((acc: any, item: any) => {
            const msg = item.error_message || 'Unknown';
            acc[msg] = (acc[msg] || 0) + 1;
            return acc;
          }, {});

          console.log(`[Discovery Queue] Failure reasons:`, errorSummary);
        }

        // Update session progress
        await updateSessionProgress(session.id);

      } catch (error: any) {
        console.error(`[Discovery Queue] Error processing session ${session.id}:`, error);
        logError('Discovery queue session error', error, {
          event_type: 'discovery_queue_session_error',
          session_id: session.id
        });
      }
    }

    const duration = Date.now() - startTime;

    logInfo({
      event_type: 'discovery_queue_processed',
      ...results,
      duration_ms: duration
    });

    return NextResponse.json({
      success: true,
      ...results,
      duration_ms: duration
    });

  } catch (error: any) {
    console.error('[Discovery Queue] Fatal error:', error);
    logError('Discovery queue fatal error', error, {
      event_type: 'discovery_queue_fatal_error'
    });

    return NextResponse.json({
      error: error.message || 'Discovery queue processing failed'
    }, { status: 500 });
  }
}

/**
 * Process individual discovery call: fetch recording, transcribe, analyze
 */
async function processDiscoveryCall(
  call: any,
  credentials: ConvosoCredentials,
  sessionId: string
): Promise<boolean> {
  const callInfo = `[Call ${call.call_id}]`;

  try {
    console.log(`${callInfo} Starting processing...`);

    // 1. Fetch recording URL
    console.log(`${callInfo} Fetching recording URL...`);
    const recordingUrl = await fetchRecordingUrl(
      call.call_id,
      call.lead_id,
      credentials
    );

    if (!recordingUrl) {
      console.warn(`${callInfo} ❌ No recording URL found`);
      throw new Error('No recording URL found');
    }
    console.log(`${callInfo} ✓ Recording URL: ${recordingUrl.substring(0, 50)}...`);

    // 2. Transcribe with Deepgram/AssemblyAI
    console.log(`${callInfo} Starting transcription...`);
    const asrResult = await transcribe(recordingUrl);

    if (!asrResult?.text && !asrResult?.translated_text) {
      console.error(`${callInfo} ❌ No transcript returned`);
      throw new Error('Transcription returned empty');
    }
    const transcript = asrResult.translated_text || asrResult.text;
    console.log(`${callInfo} ✓ Transcribed: ${transcript.substring(0, 100)}...`);

    // 3. Analyze with OpenAI 2-pass
    console.log(`${callInfo} Starting OpenAI analysis...`);
    const analysis = await analyzeCallWithOpenAI({
      ...call,
      transcript,
      duration_sec: call.call_length,
      recording_url: recordingUrl
    });

    if (!analysis) {
      console.error(`${callInfo} ❌ OpenAI analysis failed`);
      throw new Error('Analysis returned null');
    }
    console.log(`${callInfo} ✓ Analysis complete: QA Score ${analysis.qa_score || 'N/A'}`);

    // 4. Store results
    await sbAdmin
      .from('discovery_calls')
      .update({
        processing_status: 'completed',
        recording_url: recordingUrl,
        transcript,
        analysis,
        processed_at: new Date().toISOString()
      })
      .eq('id', call.id);

    console.log(`${callInfo} ✅ Successfully processed`);
    return true;

  } catch (error: any) {
    const stage = error.message.includes('recording') ? 'recording_fetch' :
                  error.message.includes('Transcription') ? 'transcription' :
                  error.message.includes('Analysis') ? 'analysis' : 'unknown';

    console.error(`${callInfo} ❌ FAILED at ${stage}:`, {
      error: error.message,
      stage
    });

    // Mark as failed and increment attempts
    await sbAdmin
      .from('discovery_calls')
      .update({
        processing_status: 'failed',
        error_message: error.message,
        attempts: (call.attempts || 0) + 1
      })
      .eq('id', call.id);

    return false;
  }
}

/**
 * Update session progress based on completed calls count
 */
async function updateSessionProgress(sessionId: string) {
  try {
    const { data: session } = await sbAdmin
      .from('discovery_sessions')
      .select('total_calls')
      .eq('id', sessionId)
      .single();

    if (!session) return;

    const { count: completedCount } = await sbAdmin
      .from('discovery_calls')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('processing_status', 'completed');

    // Progress: 5% (metadata pulled) + 95% (processing)
    const progress = 5 + Math.floor(((completedCount || 0) / session.total_calls) * 95);

    await sbAdmin
      .from('discovery_sessions')
      .update({
        progress: Math.min(progress, 99), // Cap at 99 until finalization
        processed: completedCount || 0
      })
      .eq('id', sessionId);

  } catch (error: any) {
    console.error(`[Discovery Queue] Error updating progress for ${sessionId}:`, error.message);
  }
}

/**
 * Finalize session - calculate final metrics from all completed calls
 */
async function finalizeDiscoverySession(sessionId: string) {
  try {
    console.log(`[Discovery Queue] Finalizing session ${sessionId}`);

    // Get all completed calls with analysis
    const { data: completedCalls } = await sbAdmin
      .from('discovery_calls')
      .select('*')
      .eq('session_id', sessionId)
      .eq('processing_status', 'completed');

    if (!completedCalls || completedCalls.length < 100) {
      // Not enough calls completed - mark as error
      await sbAdmin
        .from('discovery_sessions')
        .update({
          status: 'error',
          error_message: `Only ${completedCalls?.length || 0} calls completed successfully. Need at least 100 for meaningful discovery.`,
          progress: 100,
          completed_at: new Date().toISOString()
        })
        .eq('id', sessionId);
      return;
    }

    // Calculate final metrics from all completed calls
    const metrics = calculateMetricsFromCalls(completedCalls);

    // Update session as complete
    await sbAdmin
      .from('discovery_sessions')
      .update({
        status: 'complete',
        progress: 100,
        processed: completedCalls.length,
        metrics,
        completed_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    // Update agency discovery status
    const { data: session } = await sbAdmin
      .from('discovery_sessions')
      .select('agency_id')
      .eq('id', sessionId)
      .single();

    if (session?.agency_id) {
      await sbAdmin
        .from('agencies')
        .update({ discovery_status: 'completed' })
        .eq('id', session.agency_id);
    }

    console.log(`[Discovery Queue] Session ${sessionId} finalized - ${completedCalls.length} calls analyzed`);

  } catch (error: any) {
    console.error(`[Discovery Queue] Error finalizing session ${sessionId}:`, error.message);
    logError('Discovery finalization error', error, {
      event_type: 'discovery_finalization_error',
      session_id: sessionId
    });
  }
}

/**
 * Calculate discovery metrics from completed calls
 */
function calculateMetricsFromCalls(calls: any[]) {
  let pitchesDelivered = 0;
  let successfulCloses = 0;
  let earlyHangups = 0;
  let lyingDetected = 0;
  let totalQAScore = 0;
  let qaCount = 0;

  for (const call of calls) {
    const duration = call.call_length || 0;
    const analysis = call.analysis || {};

    // Count pitches (30+ seconds means agent got past opening)
    if (duration >= 30) {
      pitchesDelivered++;
    }

    // Early hangups (15 seconds or less)
    if (duration <= 15) {
      earlyHangups++;
    }

    // Successful closes from OpenAI analysis
    const outcome = analysis.analysis?.outcome || analysis.outcome;
    if (outcome === 'sale' || outcome === 'callback') {
      successfulCloses++;
    }

    // QA score (use as proxy for opening/pitch quality)
    if (analysis.qa_score) {
      totalQAScore += analysis.qa_score;
      qaCount++;
    }

    // Lying detection from red flags
    const redFlags = analysis.red_flags || analysis.risk_flags || [];
    if (
      redFlags.includes('misrepresentation_risk') ||
      redFlags.includes('confused') ||
      redFlags.includes('misleading')
    ) {
      lyingDetected++;
    }
  }

  const closeRate = pitchesDelivered > 0
    ? Math.round((successfulCloses / pitchesDelivered) * 100)
    : 0;

  const openingScore = qaCount > 0
    ? Math.round(totalQAScore / qaCount)
    : 0;

  const hangupRate = calls.length > 0
    ? Math.round((earlyHangups / calls.length) * 100)
    : 0;

  return {
    totalCallsProcessed: calls.length,
    pitchesDelivered,
    successfulCloses,
    closeRate,
    openingScore,
    earlyHangups,
    hangupRate,
    lyingDetected,
    rebuttalFailures: 0  // Placeholder - can enhance later with rebuttal detection
  };
}
