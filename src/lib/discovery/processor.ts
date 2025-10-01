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

  console.log(`[Discovery] Fetching ${targetCallCount} calls for ${selectedAgentIds?.length || 'all'} agents`);

  // Step 1: Get agents from log/retrieve if not provided
  let agentEmails: string[] = [];

  if (selectedAgentIds && selectedAgentIds.length > 0) {
    // Get emails for selected agents from recent calls
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const startTime = startDate.toISOString().split('T')[0] + ' 00:00:00';
    const endTime = endDate.toISOString().split('T')[0] + ' 23:59:59';

    const params = new URLSearchParams({
      auth_token: credentials.auth_token,
      start_time: startTime,
      end_time: endTime,
      limit: '5000'
    });

    try {
      const response = await fetch(
        `${credentials.api_base}/log/retrieve?${params.toString()}`,
        { headers: { 'Accept': 'application/json' } }
      );

      if (response.ok) {
        const data = await response.json();
        const calls = data.data?.results || [];

        // Extract emails for selected agents
        const agentsMap = new Map<string, string>();
        calls.forEach((call: any) => {
          const userId = call.user_id;
          const userEmail = call.user_email || call.agent_email;

          if (userId && userEmail && selectedAgentIds.includes(userId)) {
            agentsMap.set(userId, userEmail);
          }
        });

        agentEmails = Array.from(agentsMap.values());
        console.log(`[Discovery] Found ${agentEmails.length} agent emails for selected agents`);
      }
    } catch (error) {
      console.error('[Discovery] Failed to fetch agent emails:', error);
    }
  }

  // Step 2: Fetch recordings per agent using /users/get-recordings
  if (agentEmails.length > 0) {
    const callsPerAgent = Math.ceil(targetCallCount / agentEmails.length);

    for (const email of agentEmails) {
      try {
        const response = await fetch(
          `${credentials.api_base}/users/get-recordings`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              auth_token: credentials.auth_token,
              user: email,
              limit: callsPerAgent * 2 // Fetch extra to account for filtering
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          const recordings = data.recordings || data.data || [];

          // CRITICAL: Filter to 10+ seconds ONLY
          const validCalls = recordings.filter((call: any) => {
            const duration = call.duration_sec || call.duration || 0;
            return duration >= 10;
          });

          allCalls.push(...validCalls);

          console.log(`[Discovery] Agent ${email}: ${validCalls.length} calls (10+ sec) out of ${recordings.length} total`);

          // Update progress
          const progress = Math.floor((allCalls.length / targetCallCount) * 30); // 0-30% for fetching
          await sbAdmin.from('discovery_sessions').update({
            status: 'pulling',
            progress,
            processed: allCalls.length
          }).eq('id', sessionId);

          // Rate limit protection
          await new Promise(resolve => setTimeout(resolve, 500));

          // Stop if we have enough
          if (allCalls.length >= targetCallCount) {
            break;
          }
        }
      } catch (error: any) {
        console.error(`[Discovery] Error fetching for agent ${email}:`, error.message);
      }
    }
  }

  // DOUBLE CHECK: Ensure all calls are 10+ seconds
  const validCalls = allCalls.filter((call: any) => {
    const duration = call.duration_sec || call.duration || 0;
    return duration >= 10;
  });

  console.log(`[Discovery] Fetching complete: ${validCalls.length} calls (10+ sec) retrieved`);
  return validCalls.slice(0, targetCallCount); // Trim to exact target
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

    const startTime = startDate.toISOString().split('T')[0] + ' 00:00:00';
    const endTime = endDate.toISOString().split('T')[0] + ' 23:59:59';

    // Use log/retrieve to get calls from last 30 days
    const params = new URLSearchParams({
      auth_token: credentials.auth_token,
      start_time: startTime,
      end_time: endTime,
      limit: '10000' // Fetch enough to count
    });

    const response = await fetch(
      `${credentials.api_base}/log/retrieve?${params.toString()}`,
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

    const data = await response.json();
    const calls = data.data?.results || [];

    // CRITICAL: Only count calls 10 seconds or longer
    const validCalls = calls.filter((call: any) => {
      const duration = call.duration_sec || call.duration || 0;
      return duration >= 10;
    });

    console.log(`[Discovery] Found ${validCalls.length} calls (10+ sec) out of ${calls.length} total`);

    return {
      available: validCalls.length >= 100, // Minimum 100 calls (10+ sec) needed
      callCount: validCalls.length
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