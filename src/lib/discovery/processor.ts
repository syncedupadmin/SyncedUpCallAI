// Shared Discovery Processing Logic
// Reusable discovery engine for both admin and agency-initiated discovery

import { db } from '@/server/db';
import { sbAdmin } from '@/lib/supabase-admin';
import {
  analyzeOpening,
  analyzeRebuttals,
  detectHangups,
  LYING_PATTERNS
} from '@/lib/discovery-engine';
import { decryptConvosoCredentials } from '@/lib/crypto';

export interface ConvosoCredentials {
  api_key: string;
  auth_token: string;
  api_base: string;
}

export interface DiscoveryConfig {
  callCount: number;
  agentSelection?: string;
  includeShortCalls?: boolean;
  detectLying?: boolean;
  analyzeOpenings?: boolean;
  trackRebuttals?: boolean;
}

export interface DiscoveryMetrics {
  closeRate: number;
  pitchesDelivered: number;
  successfulCloses: number;
  openingScore: number;
  rebuttalFailures: number;
  hangupRate: number;
  earlyHangups: number;
  lyingDetected: number;
  agentMetrics: any[];
  totalCallsProcessed: number;
}

/**
 * Fetch calls from Convoso API in chunks with retry logic
 */
async function fetchCallsInChunks(
  credentials: ConvosoCredentials,
  sessionId: string,
  targetCallCount: number = 2500
): Promise<any[]> {
  const CHUNK_SIZE = 100;
  const chunks = Math.ceil(targetCallCount / CHUNK_SIZE);
  const allCalls: any[] = [];
  const MAX_RETRIES = 3;

  console.log(`[Discovery] Fetching ${targetCallCount} calls in ${chunks} chunks`);

  for (let i = 0; i < chunks; i++) {
    const offset = i * CHUNK_SIZE;
    let retryCount = 0;
    let success = false;

    while (retryCount < MAX_RETRIES && !success) {
      try {
        const params = new URLSearchParams({
          auth_token: credentials.auth_token,
          limit: String(Math.min(CHUNK_SIZE, targetCallCount - allCalls.length)),
          offset: String(offset),
          include_recording: 'true',
          include_disposition: 'true',
          date_from: '30_days_ago'
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(
          `${credentials.api_base}/calls?${params.toString()}`,
          {
            headers: {
              'Authorization': `Bearer ${credentials.api_key}`,
              'Accept': 'application/json'
            },
            signal: controller.signal
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Convoso API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success && data.data?.entries) {
          allCalls.push(...data.data.entries);
          success = true;

          // Update progress
          const progress = Math.floor((allCalls.length / targetCallCount) * 30); // 0-30% for fetching
          await sbAdmin.from('discovery_sessions').update({
            status: 'pulling',
            progress,
            processed: allCalls.length
          }).eq('id', sessionId);

          console.log(`[Discovery] Fetched chunk ${i + 1}/${chunks}: ${allCalls.length}/${targetCallCount} calls`);

          // Rate limit protection - wait 500ms between requests
          if (i < chunks - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          // If this chunk had no data, we've reached the end
          if (data.data.entries.length === 0) {
            console.log(`[Discovery] No more data available at offset ${offset}`);
            break;
          }
        } else {
          throw new Error('Invalid response format from Convoso API');
        }
      } catch (error: any) {
        retryCount++;
        console.error(`[Discovery] Chunk ${i} attempt ${retryCount} failed:`, error.message);

        if (retryCount < MAX_RETRIES) {
          // Exponential backoff: 1s, 2s, 4s
          const backoffMs = Math.pow(2, retryCount) * 1000;
          console.log(`[Discovery] Retrying chunk ${i} after ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        } else {
          console.error(`[Discovery] Chunk ${i} failed after ${MAX_RETRIES} attempts, continuing with partial data`);
          break; // Continue with what we have
        }
      }
    }

    // If we've reached the target or got no more data, stop
    if (allCalls.length >= targetCallCount) {
      break;
    }
  }

  console.log(`[Discovery] Fetching complete: ${allCalls.length} calls retrieved`);
  return allCalls.slice(0, targetCallCount); // Trim to exact target
}

/**
 * Analyze a batch of calls
 */
async function analyzeBatch(calls: any[], config: DiscoveryConfig): Promise<Partial<DiscoveryMetrics>> {
  const results: Partial<DiscoveryMetrics> = {
    pitchesDelivered: 0,
    successfulCloses: 0,
    openingScore: 0,
    rebuttalFailures: 0,
    earlyHangups: 0,
    lyingDetected: 0
  };

  let totalOpeningScore = 0;
  let openingsAnalyzed = 0;

  for (const call of calls) {
    // Count pitches (calls >= 30 seconds)
    if (call.duration_sec >= 30) {
      results.pitchesDelivered! += 1;
    }

    // Count closes
    if (['SALE', 'APPOINTMENT_SET', 'INTERESTED'].includes(call.disposition)) {
      results.successfulCloses! += 1;
    }

    // Early hangups (<= 15 seconds)
    if (call.duration_sec <= 15) {
      results.earlyHangups! += 1;
    }

    // Analyze transcript if available
    if (call.transcript) {
      // Opening analysis
      if (config.analyzeOpenings !== false) {
        const openingAnalysis = analyzeOpening(call.transcript, call.duration_sec);
        totalOpeningScore += openingAnalysis.score;
        openingsAnalyzed += 1;
      }

      // Rebuttal analysis
      if (config.trackRebuttals !== false) {
        const rebuttalAnalysis = analyzeRebuttals(call.transcript);
        results.rebuttalFailures! += rebuttalAnalysis.gave_up_count;
      }

      // Lying detection
      if (config.detectLying !== false) {
        const lyingDetected = detectLyingInTranscript(call.transcript);
        if (lyingDetected) {
          results.lyingDetected! += 1;
        }
      }
    }
  }

  // Calculate average opening score
  if (openingsAnalyzed > 0) {
    results.openingScore = Math.round(totalOpeningScore / openingsAnalyzed);
  }

  return results;
}

/**
 * Detect lying patterns in transcript
 */
function detectLyingInTranscript(transcript: string): boolean {
  for (const pattern of LYING_PATTERNS) {
    if (pattern.type === 'dental_scam') {
      for (const marker of pattern.markers) {
        if (transcript.toLowerCase().includes(marker)) {
          // Check if it's actually free or has hidden costs
          if (
            transcript.includes('membership') ||
            transcript.includes('enrollment') ||
            transcript.includes('monthly fee') ||
            transcript.includes('copay')
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Main discovery processor - can be called from admin or agency routes
 */
export async function processDiscoveryForAgency(
  sessionId: string,
  agencyId: string,
  credentials: ConvosoCredentials,
  config: DiscoveryConfig
): Promise<void> {
  console.log(`[Discovery] Starting for agency ${agencyId}, session ${sessionId}`);
  console.log(`[Discovery] Config:`, config);

  const insights: string[] = [];
  const metrics: DiscoveryMetrics = {
    closeRate: 0,
    pitchesDelivered: 0,
    successfulCloses: 0,
    openingScore: 0,
    rebuttalFailures: 0,
    hangupRate: 0,
    earlyHangups: 0,
    lyingDetected: 0,
    agentMetrics: [],
    totalCallsProcessed: 0
  };

  try {
    // Update status to pulling
    await sbAdmin.from('discovery_sessions').update({
      status: 'pulling',
      progress: 0
    }).eq('id', sessionId);

    // Fetch calls from Convoso
    const calls = await fetchCallsInChunks(credentials, sessionId, config.callCount);

    if (!calls || calls.length === 0) {
      throw new Error('No calls retrieved from Convoso API');
    }

    console.log(`[Discovery] Retrieved ${calls.length} calls, starting analysis`);
    metrics.totalCallsProcessed = calls.length;

    // Update status to analyzing
    await sbAdmin.from('discovery_sessions').update({
      status: 'analyzing',
      progress: 30,
      processed: calls.length
    }).eq('id', sessionId);

    // Process calls in batches of 50
    const BATCH_SIZE = 50;
    const totalBatches = Math.ceil(calls.length / BATCH_SIZE);

    for (let i = 0; i < calls.length; i += BATCH_SIZE) {
      const batch = calls.slice(i, Math.min(i + BATCH_SIZE, calls.length));
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      console.log(`[Discovery] Processing batch ${batchNumber}/${totalBatches}`);

      const batchResults = await analyzeBatch(batch, config);

      // Accumulate metrics
      metrics.pitchesDelivered += batchResults.pitchesDelivered || 0;
      metrics.successfulCloses += batchResults.successfulCloses || 0;
      metrics.rebuttalFailures += batchResults.rebuttalFailures || 0;
      metrics.earlyHangups += batchResults.earlyHangups || 0;
      metrics.lyingDetected += batchResults.lyingDetected || 0;

      // Running average for opening score
      if (batchResults.openingScore) {
        metrics.openingScore = Math.round(
          (metrics.openingScore * (batchNumber - 1) + batchResults.openingScore) / batchNumber
        );
      }

      // Calculate close rate
      if (metrics.pitchesDelivered > 0) {
        metrics.closeRate = (metrics.successfulCloses / metrics.pitchesDelivered) * 100;
      }

      // Generate progressive insights
      if (i === 50) {
        insights.push(`Initial scan: ${metrics.pitchesDelivered} pitches delivered`);
      }
      if (i === 500 && metrics.earlyHangups > 50) {
        insights.push(`Alert: ${metrics.earlyHangups} calls ended in first 15 seconds`);
      }
      if (i === 1000) {
        insights.push(`Halfway through: ${metrics.closeRate.toFixed(1)}% close rate so far`);
      }
      if (i === 2000 && metrics.lyingDetected > 0) {
        insights.push(`Deception patterns detected in ${metrics.lyingDetected} calls`);
      }

      // Update progress (30% done from fetch, 70% for analysis)
      const analysisProgress = 30 + Math.floor((i / calls.length) * 70);
      await sbAdmin.from('discovery_sessions').update({
        progress: analysisProgress,
        metrics: JSON.stringify(metrics),
        insights: JSON.stringify(insights)
      }).eq('id', sessionId);
    }

    // Final hangup analysis
    const hangupAnalysis = detectHangups(calls);
    metrics.hangupRate = (hangupAnalysis.total_hangups / calls.length) * 100;

    // Final insights
    insights.push(`Analysis complete: ${metrics.totalCallsProcessed} calls processed`);
    insights.push(`Overall closing rate: ${metrics.closeRate.toFixed(1)}%`);
    insights.push(`Average opening score: ${metrics.openingScore}/100`);

    if (hangupAnalysis.agent_caused_hangups > 0) {
      insights.push(`WARNING: ${hangupAnalysis.agent_caused_hangups} agent-caused hangups detected`);
    }

    if (metrics.rebuttalFailures > 0) {
      insights.push(`Agents gave up without rebuttals ${metrics.rebuttalFailures} times`);
    }

    // Update session with final results
    await sbAdmin.from('discovery_sessions').update({
      status: 'complete',
      progress: 100,
      processed: calls.length,
      metrics: JSON.stringify(metrics),
      insights: JSON.stringify(insights),
      completed_at: new Date().toISOString()
    }).eq('id', sessionId);

    // Update agency status to completed
    await sbAdmin.from('agencies').update({
      discovery_status: 'completed'
    }).eq('id', agencyId);

    console.log(`[Discovery] Completed successfully for agency ${agencyId}`);
    console.log(`[Discovery] Final metrics:`, metrics);

  } catch (error: any) {
    console.error(`[Discovery] Error for agency ${agencyId}:`, error);

    // Update session with error
    await sbAdmin.from('discovery_sessions').update({
      status: 'error',
      error_message: error.message || 'Unknown error occurred',
      insights: JSON.stringify(insights)
    }).eq('id', sessionId);

    // Update agency status to failed
    await sbAdmin.from('agencies').update({
      discovery_status: 'failed'
    }).eq('id', agencyId);

    throw error;
  }
}

/**
 * Check if agency has sufficient data for discovery
 */
export async function checkConvosoDataAvailability(
  credentials: ConvosoCredentials
): Promise<{ available: boolean; callCount: number; error?: string }> {
  try {
    const response = await fetch(
      `${credentials.api_base}/calls?limit=1&auth_token=${credentials.auth_token}`,
      {
        headers: {
          'Authorization': `Bearer ${credentials.api_key}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return {
        available: false,
        callCount: 0,
        error: `Convoso API error: ${response.status}`
      };
    }

    const data = await response.json();
    const totalCalls = data.total || data.data?.total || 0;

    return {
      available: totalCalls >= 100, // Minimum 100 calls needed
      callCount: totalCalls
    };
  } catch (error: any) {
    console.error('[Discovery] Error checking data availability:', error);
    return {
      available: false,
      callCount: 0,
      error: error.message
    };
  }
}