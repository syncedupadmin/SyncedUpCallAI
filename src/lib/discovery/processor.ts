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
  selectedAgents?: string[]; // Array of agent user IDs
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
 * Fetch calls from Convoso API using agent-based approach with 10+ second filter
 */
async function fetchCallsInChunks(
  credentials: ConvosoCredentials,
  sessionId: string,
  targetCallCount: number = 2500,
  selectedAgentIds?: string[]
): Promise<any[]> {
  const allCalls: any[] = [];

  if (!selectedAgentIds || selectedAgentIds.length === 0) {
    console.warn('[Discovery] No agents selected');
    return [];
  }

  const agentCount = selectedAgentIds.length;
  console.log(`[Discovery] Fetching ${targetCallCount} calls evenly across ${agentCount} agents`);
  console.log(`[Discovery] Selected agent IDs:`, selectedAgentIds);
  console.log(`[Discovery] Auth token present: ${!!credentials.auth_token}`);
  console.log(`[Discovery] API base: ${credentials.api_base}`);

  // Step 1: Get agent user IDs - we'll use them directly for the recordings API
  const agentUserIds = selectedAgentIds; // Use the IDs directly

  if (agentUserIds.length === 0) {
    console.error('[Discovery] No agent IDs provided');
    return [];
  }

  // Step 2: Calculate distribution strategy
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const callsPerAgent = Math.ceil(targetCallCount / agentUserIds.length);
  const dateChunks = 6; // Divide 30 days into 6 chunks of 5 days each
  const callsPerChunk = Math.ceil(callsPerAgent / dateChunks);
  const daysPerChunk = Math.floor(30 / dateChunks);

  console.log(`[Discovery] Strategy: ${callsPerAgent} calls/agent, ${callsPerChunk} calls/chunk, ${daysPerChunk} days/chunk`);

  // Step 3: Fetch recordings for each agent across date chunks
  let totalFetched = 0;

  console.log(`[Discovery] Starting fetch loop for ${agentUserIds.length} agents, ${dateChunks} chunks each`);

  for (const userId of agentUserIds) {
    console.log(`[Discovery] Processing agent: ${userId}`);

    for (let chunkIndex = 0; chunkIndex < dateChunks; chunkIndex++) {
      const chunkStartDate = new Date(startDate);
      chunkStartDate.setDate(chunkStartDate.getDate() + (chunkIndex * daysPerChunk));

      const chunkEndDate = new Date(chunkStartDate);
      chunkEndDate.setDate(chunkEndDate.getDate() + daysPerChunk - 1);

      // Don't exceed the end date
      if (chunkEndDate > endDate) {
        chunkEndDate.setTime(endDate.getTime());
      }

      const chunkStart = chunkStartDate.toISOString().split('T')[0] + ' 00:00:00';
      const chunkEnd = chunkEndDate.toISOString().split('T')[0] + ' 23:59:59';

      // Add random offset for variety
      const randomOffset = Math.floor(Math.random() * 20);

      try {
        const params = new URLSearchParams({
          auth_token: credentials.auth_token,
          user: String(userId), // Convert to string in case it's numeric or email
          start_time: chunkStart,
          end_time: chunkEnd,
          limit: String(callsPerChunk * 3), // Fetch extra for 10+ sec filtering
          offset: String(randomOffset)
        });

        console.log(`[Discovery] Fetching from /users/recordings: user=${userId} (type: ${typeof userId}), dates=${chunkStart} to ${chunkEnd}`);

        const response = await fetch(
          `${credentials.api_base}/users/recordings?${params.toString()}`,
          { headers: { 'Accept': 'application/json' } }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Discovery] API error for agent ${userId}: ${response.status} - ${errorText}`);
          continue;
        }

        const data = await response.json();
        console.log(`[Discovery] API response structure:`, {
          hasData: !!data.data,
          hasEntries: !!data.data?.entries,
          entriesLength: data.data?.entries?.length || 0,
          keys: Object.keys(data).join(',')
        });

        const recordings = data.data?.entries || [];
        console.log(`[Discovery] Raw recordings count: ${recordings.length}`);

        if (recordings.length > 0) {
          console.log(`[Discovery] First recording sample:`, JSON.stringify(recordings[0]).substring(0, 300));
        }

        // CRITICAL: Filter to 10+ seconds ONLY using 'seconds' field
        const validCalls = recordings.filter((call: any) => {
          const duration = call.seconds || 0;
          return duration >= 10;
        });

        console.log(`[Discovery] Filtered to ${validCalls.length} calls with 10+ seconds`);

        allCalls.push(...validCalls);
        totalFetched += validCalls.length;

        console.log(`[Discovery] Agent ${userId} chunk ${chunkIndex + 1}/${dateChunks}: ${validCalls.length} calls (10+ sec) from ${recordings.length} total`);
        console.log(`[Discovery] Running total: ${totalFetched} calls`);

        // Update progress
        const progress = Math.min(30, Math.floor((totalFetched / targetCallCount) * 30));
        await sbAdmin.from('discovery_sessions').update({
          status: 'pulling',
          progress,
          processed: totalFetched
        }).eq('id', sessionId);

        // Rate limit protection
        await new Promise(resolve => setTimeout(resolve, 300));

        // Stop if we have enough
        if (totalFetched >= targetCallCount * 1.2) {
          break;
        }
      } catch (error: any) {
        console.error(`[Discovery] Error fetching chunk ${chunkIndex} for agent ${userId}:`, error.message, error.stack);
      }
    }

    if (totalFetched >= targetCallCount * 1.2) {
      break;
    }
  }

  // Step 4: Randomize and select final set
  console.log(`[Discovery] Fetch complete - total calls collected: ${allCalls.length}`);
  console.log(`[Discovery] Target was: ${targetCallCount}`);

  if (allCalls.length === 0) {
    console.error('[Discovery] ERROR: No calls were fetched! Check API responses above.');
    return [];
  }

  const shuffled = allCalls.sort(() => Math.random() - 0.5);

  console.log(`[Discovery] Fetched ${shuffled.length} total calls, selecting ${targetCallCount}`);
  return shuffled.slice(0, targetCallCount);
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

    // Fetch calls from Convoso (with selected agents if provided)
    const calls = await fetchCallsInChunks(
      credentials,
      sessionId,
      config.callCount,
      config.selectedAgents
    );

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
    // Calculate date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const dateStart = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const dateEnd = endDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Use agent-performance/search to get accurate call counts
    const params = new URLSearchParams({
      auth_token: credentials.auth_token,
      date_start: dateStart,
      date_end: dateEnd
    });

    const response = await fetch(
      `${credentials.api_base}/agent-performance/search?${params.toString()}`,
      {
        headers: {
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

    const result = await response.json();

    if (!result.success || !result.data) {
      return {
        available: false,
        callCount: 0,
        error: 'Invalid response from Convoso API'
      };
    }

    // Sum up human_answered calls from all agents (actual connected calls 10+ sec)
    const agentData = Object.values(result.data) as any[];
    const totalHumanAnswered = agentData.reduce((sum, agent) => {
      return sum + (agent.human_answered || 0);
    }, 0);

    console.log(`[Discovery] Found ${totalHumanAnswered} human-answered calls across ${agentData.length} agents`);

    return {
      available: totalHumanAnswered >= 100, // Minimum 100 calls needed
      callCount: totalHumanAnswered
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