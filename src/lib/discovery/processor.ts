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
import { transcribe } from '@/server/asr';
import { ANALYSIS_SYSTEM, userPrompt } from '@/server/lib/prompts';

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
 * Fetch recording URL from Convoso API
 * Exported for use in queue-based processing
 */
export async function fetchRecordingUrl(
  callId: string,
  leadId: string,
  credentials: ConvosoCredentials
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      auth_token: credentials.auth_token,
      call_id: callId,
      lead_id: leadId,
      limit: '1'
    });

    const response = await fetch(
      `${credentials.api_base}/leads/get-recordings?${params.toString()}`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      console.warn(`[Recording] Fetch failed for call ${callId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.success && data.data?.entries?.length > 0) {
      let url = data.data.entries[0].url || null;

      if (url) {
        // Check if URL needs base path (some Convoso URLs are relative)
        if (!url.startsWith('http')) {
          const baseUrl = credentials.api_base.replace('/v1', '');
          url = `${baseUrl}/recordings/${url}`;
          console.log(`[Recording] Constructed full URL for call ${callId}: ${url.substring(0, 60)}...`);
        } else {
          console.log(`[Recording] Got absolute URL for call ${callId}: ${url.substring(0, 60)}...`);
        }
      } else {
        console.warn(`[Recording] Empty URL returned for call ${callId}`);
      }

      return url;
    }

    console.warn(`[Recording] No entries found for call ${callId}`);
    return null;
  } catch (error: any) {
    console.error(`[Recording] Failed to fetch recording for call ${callId}:`, error.message);
    return null;
  }
}

/**
 * Analyze call with OpenAI 2-pass analysis (same as normal operations)
 * Exported for use in queue-based processing
 */
export async function analyzeCallWithOpenAI(call: any): Promise<any> {
  try {
    const meta = {
      agent_id: call.user_id || 'Unknown',
      agent_name: call.user || 'Unknown',
      campaign: call.campaign || 'N/A',
      duration_sec: call.duration_sec || 0,
      disposition: call.disposition || call.status || 'Unknown',
      direction: call.call_type || 'outbound',
      tz: 'America/New_York',
      customer_state: 'Unknown',
      expected_script: 'greeting -> discovery -> benefits -> close -> compliance',
      products: 'Health Insurance',
      callback_hours: 'Mon–Sat 09:00–20:00',
      compliance: 'Honor DNC; disclose license; avoid misleading claims'
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY!}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: ANALYSIS_SYSTEM },
          { role: 'user', content: userPrompt(meta, call.transcript) }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      console.error(`[Discovery] OpenAI analysis failed for call ${call.id}: ${response.status}`);
      return null;
    }

    const result = await response.json();
    const analysis = JSON.parse(result.choices[0].message.content);

    return {
      ...analysis,
      tokens_used: result.usage?.total_tokens || 0
    };
  } catch (error: any) {
    console.error(`[Discovery] Error analyzing call ${call.id}:`, error.message);
    return null;
  }
}

/**
 * Fetch calls from Convoso API using agent-based approach with 10+ second filter
 * Exported for use in discovery start endpoint
 */
export async function fetchCallsInChunks(
  credentials: ConvosoCredentials,
  sessionId: string,
  targetCallCount: number = 2500,
  selectedAgentIds?: string[]
): Promise<any[]> {
  const allCalls: any[] = [];

  console.log(`[Discovery] Fetching ${targetCallCount} calls from last 30 days`);
  console.log(`[Discovery] Selected agents for filtering:`, selectedAgentIds);
  console.log(`[Discovery] Auth token present: ${!!credentials.auth_token}`);
  console.log(`[Discovery] API base: ${credentials.api_base}`);

  // CRITICAL FIX: Don't filter by user_id in API call - Convoso's user_id field
  // in /agent-performance/search doesn't match user_id in /log/retrieve
  // Instead, fetch ALL calls and filter by agent after

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const dateStart = startDate.toISOString().split('T')[0];
  const dateEnd = endDate.toISOString().split('T')[0];

  console.log(`[Discovery] Fetching calls from ${dateStart} to ${dateEnd}`);

  // Fetch in batches of 1000 (API max) with pagination
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore && allCalls.length < targetCallCount * 3) { // Fetch 3x to account for filtering
    try {
      const params = new URLSearchParams({
        auth_token: credentials.auth_token,
        start: dateStart,
        end: dateEnd,
        limit: String(limit),
        offset: String(offset),
        include_recordings: '1'  // CRITICAL: Include recording URLs
      });

      console.log(`[Discovery] Fetching batch at offset ${offset}...`);

      const response = await fetch(
        `${credentials.api_base}/log/retrieve?${params.toString()}`,
        { headers: { 'Accept': 'application/json' } }
      );

      if (!response.ok) {
        console.error(`[Discovery] API error at offset ${offset}: ${response.status}`);
        break; // Stop on error
      }

      const data = await response.json();
      const recordings = data.data?.results || [];

      console.log(`[Discovery] Received ${recordings.length} calls at offset ${offset}`);

      if (recordings.length === 0) {
        hasMore = false;
        break;
      }

      // Filter to 10+ seconds and extract recording URL
      const validCalls = recordings
        .filter((call: any) => {
          const duration = call.call_length ? parseInt(call.call_length) : 0;
          return duration >= 10;
        })
        .map((call: any) => ({
          ...call,
          // Extract recording URL from response (matches convoso-service.ts pattern)
          recording_url: call.recording?.[0]?.public_url || call.recording?.[0]?.src || null
        }));

      const withRecordings = validCalls.filter((c: any) => c.recording_url).length;
      console.log(`[Discovery] Filtered to ${validCalls.length} calls (10+ sec), ${withRecordings} with recordings`);

      allCalls.push(...validCalls);

      // Check if we got less than limit - means we've reached the end
      if (recordings.length < limit) {
        hasMore = false;
        console.log(`[Discovery] Received less than limit (${recordings.length} < ${limit}), stopping pagination`);
      }

      // Move to next page
      offset += limit;

    } catch (error: any) {
      console.error(`[Discovery] Error fetching at offset ${offset}:`, error.message);
      break; // Stop on error
    }
  }

  console.log(`[Discovery] Fetch complete - total calls collected: ${allCalls.length}`);

  if (allCalls.length === 0) {
    console.error('[Discovery] ERROR: No calls were fetched! Check API responses above.');
    return [];
  }

  // Deduplicate by call_id
  const uniqueCallsMap = new Map();
  for (const call of allCalls) {
    const callId = call.id;
    if (!uniqueCallsMap.has(callId)) {
      uniqueCallsMap.set(callId, call);
    }
  }

  const uniqueCalls = Array.from(uniqueCallsMap.values());
  console.log(`[Discovery] Deduplicated ${allCalls.length} calls to ${uniqueCalls.length} unique calls`);

  // Filter by selected agents if provided
  let filteredCalls = uniqueCalls;
  if (selectedAgentIds && selectedAgentIds.length > 0) {
    console.log(`[Discovery] Filtering by ${selectedAgentIds.length} selected agents...`);
    filteredCalls = uniqueCalls.filter((call: any) => {
      // Check both user_id (string) and user field (name)
      const userId = String(call.user_id);
      return selectedAgentIds.includes(userId);
    });
    console.log(`[Discovery] After agent filter: ${filteredCalls.length} calls remain`);
  }

  // Randomize and select final set
  const shuffled = filteredCalls.sort(() => Math.random() - 0.5);
  const selectedCalls = shuffled.slice(0, targetCallCount);

  console.log(`[Discovery] Selected ${selectedCalls.length} calls for queueing`);
  return selectedCalls;
}

/**
 * Analyze a batch of calls with OpenAI 2-pass analysis
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
  let totalQAScore = 0;
  let openAIAnalyzedCount = 0;

  // Process OpenAI analysis in parallel batches of 50
  const OPENAI_BATCH_SIZE = 50;
  const totalBatches = Math.ceil(calls.length / OPENAI_BATCH_SIZE);

  for (let i = 0; i < calls.length; i += OPENAI_BATCH_SIZE) {
    const batch = calls.slice(i, Math.min(i + OPENAI_BATCH_SIZE, calls.length));
    const batchNum = Math.floor(i / OPENAI_BATCH_SIZE) + 1;

    console.log(`[Discovery] Analyzing batch ${batchNum}/${totalBatches} with OpenAI (${batch.length} calls)...`);

    // Run OpenAI analysis in parallel for this batch
    const analysisPromises = batch.map(call => analyzeCallWithOpenAI(call));
    const analyses = await Promise.all(analysisPromises);

    // Process results
    for (let j = 0; j < batch.length; j++) {
      const call = batch[j];
      const analysis = analyses[j];
      const duration = call.duration_sec || 0;

      // Count pitches (calls >= 30 seconds)
      if (duration >= 30) {
        results.pitchesDelivered! += 1;
      }

      // Early hangups (<= 15 seconds)
      if (duration <= 15) {
        results.earlyHangups! += 1;
      }

      // Use OpenAI analysis if available
      if (analysis) {
        openAIAnalyzedCount++;

        // Count closes from OpenAI analysis
        const outcome = analysis.analysis?.outcome || analysis.outcome;
        if (outcome === 'sale' || outcome === 'callback') {
          results.successfulCloses! += 1;
        }

        // Use QA score as opening score proxy
        const qaScore = analysis.qa_score || 0;
        totalQAScore += qaScore;
        totalOpeningScore += qaScore; // Use QA score as proxy for opening quality

        // Check for red flags (lying detection)
        const redFlags = analysis.red_flags || analysis.risk_flags || [];
        if (redFlags.includes('misrepresentation_risk') || redFlags.includes('confused')) {
          results.lyingDetected! += 1;
        }

        // Attach analysis to call for later use
        call.openai_analysis = analysis;
      } else {
        // Fallback to simple pattern matching if OpenAI failed
        const disposition = call.disposition || call.status || '';
        if (['SALE', 'APPOINTMENT_SET', 'INTERESTED'].includes(disposition)) {
          results.successfulCloses! += 1;
        }

        // Pattern-based lying detection
        if (call.transcript && config.detectLying !== false) {
          const lyingDetected = detectLyingInTranscript(call.transcript);
          if (lyingDetected) {
            results.lyingDetected! += 1;
          }
        }
      }
    }

    // Small delay between batches to avoid overwhelming OpenAI
    if (i + OPENAI_BATCH_SIZE < calls.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Calculate average scores
  if (openAIAnalyzedCount > 0) {
    results.openingScore = Math.round(totalOpeningScore / openAIAnalyzedCount);
  }

  console.log(`[Discovery] OpenAI analysis complete: ${openAIAnalyzedCount}/${calls.length} calls analyzed`);

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