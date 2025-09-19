import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { v4 as uuidv4 } from 'uuid';
import {
  analyzeOpening,
  analyzeRebuttals,
  detectHangups,
  LYING_PATTERNS,
  DISCOVERY_PROMPTS
} from '@/lib/discovery-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large discoveries

// Hardcoded Convoso credentials (YOUR active account)
const CONVOSO_CONFIG = {
  API_BASE: process.env.CONVOSO_API_BASE || 'https://api.convoso.com/v1',
  API_KEY: process.env.CONVOSO_API_KEY || 'YOUR_API_KEY_HERE', // Replace in production
  AUTH_TOKEN: process.env.CONVOSO_AUTH_TOKEN || 'YOUR_AUTH_TOKEN_HERE' // Replace in production
};

interface DiscoveryRequest {
  callCount: number;
  agentSelection: string;
  includeShortCalls: boolean;
  detectLying: boolean;
  analyzeOpenings: boolean;
  trackRebuttals: boolean;
}

export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: DiscoveryRequest = await req.json();
    const sessionId = uuidv4();

    // Create discovery session in database
    await db.none(`
      INSERT INTO discovery_sessions (
        id, status, total_calls, config, started_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [sessionId, 'initializing', body.callCount, JSON.stringify(body)]);

    // Start async processing (don't await)
    processDiscovery(sessionId, body).catch(error => {
      console.error('Discovery processing error:', error);
      updateSessionStatus(sessionId, 'error', { error: error.message });
    });

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'Discovery started'
    });

  } catch (error: any) {
    console.error('Discovery start error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start discovery' },
      { status: 500 }
    );
  }
}

async function processDiscovery(sessionId: string, config: DiscoveryRequest) {
  let processed = 0;
  const insights: string[] = [];
  const metrics = {
    closeRate: 0,
    pitchesDelivered: 0,
    successfulCloses: 0,
    openingScore: 0,
    rebuttalFailures: 0,
    hangupRate: 0,
    earlyHangups: 0,
    lyingDetected: 0,
    agentMetrics: []
  };

  try {
    // Update status to pulling
    await updateSessionStatus(sessionId, 'pulling', { progress: 0 });

    // Pull calls from Convoso
    console.log(`[Discovery] Pulling ${config.callCount} calls from Convoso`);
    const calls = await pullCallsFromConvoso(config.callCount, config.agentSelection);

    if (!calls || calls.length === 0) {
      throw new Error('No calls retrieved from Convoso');
    }

    // Update status to analyzing
    await updateSessionStatus(sessionId, 'analyzing', {
      progress: 10,
      totalRetrieved: calls.length
    });

    // Process calls in batches
    const batchSize = 50;
    for (let i = 0; i < calls.length; i += batchSize) {
      const batch = calls.slice(i, Math.min(i + batchSize, calls.length));

      // Analyze batch
      const batchResults = await analyzeBatch(batch, config);

      // Update metrics
      processed += batch.length;
      metrics.pitchesDelivered += batchResults.pitches;
      metrics.successfulCloses += batchResults.closes;
      metrics.openingScore = (metrics.openingScore + batchResults.openingScore) / 2;
      metrics.rebuttalFailures += batchResults.rebuttalFailures;
      metrics.earlyHangups += batchResults.earlyHangups;
      metrics.lyingDetected += batchResults.lyingDetected;

      // Calculate close rate
      if (metrics.pitchesDelivered > 0) {
        metrics.closeRate = (metrics.successfulCloses / metrics.pitchesDelivered) * 100;
      }

      // Generate insights progressively
      if (processed === 50) {
        insights.push(`Average opening duration: ${batchResults.avgOpeningTime}s`);
      }
      if (processed === 100 && metrics.earlyHangups > 10) {
        insights.push(`Alert: ${metrics.earlyHangups}% of calls end in first 15 seconds`);
      }
      if (processed === 200 && metrics.lyingDetected > 0) {
        insights.push(`Deception patterns detected in ${metrics.lyingDetected} calls`);
      }
      if (processed === 500) {
        insights.push(`Top performer closing rate: ${batchResults.topPerformer}%`);
      }

      // Update progress
      const progress = Math.round((processed / calls.length) * 100);
      await updateSessionStatus(sessionId, 'analyzing', {
        progress,
        processed,
        metrics,
        insights
      });
    }

    // Hangup analysis on full dataset
    const hangupAnalysis = detectHangups(calls);
    metrics.hangupRate = (hangupAnalysis.total_hangups / calls.length) * 100;

    // Final insights
    insights.push(`Analysis complete: ${processed} calls processed`);
    insights.push(`Overall closing rate: ${metrics.closeRate.toFixed(1)}%`);
    if (hangupAnalysis.agent_caused_hangups > 0) {
      insights.push(`WARNING: ${hangupAnalysis.agent_caused_hangups} agent-caused hangups detected`);
    }

    // Update final status
    await updateSessionStatus(sessionId, 'complete', {
      progress: 100,
      processed,
      metrics,
      insights,
      completedAt: new Date()
    });

  } catch (error: any) {
    console.error('Discovery processing error:', error);
    await updateSessionStatus(sessionId, 'error', {
      error: error.message,
      processed,
      insights
    });
    throw error;
  }
}

async function pullCallsFromConvoso(limit: number, agentSelection: string): Promise<any[]> {
  const calls: any[] = [];
  const pageSize = 100;
  let offset = 0;

  while (calls.length < limit) {
    const params = new URLSearchParams({
      auth_token: CONVOSO_CONFIG.AUTH_TOKEN,
      limit: String(Math.min(pageSize, limit - calls.length)),
      offset: String(offset),
      include_recording: 'true',
      include_disposition: 'true',
      date_from: '30_days_ago' // Last 30 days
    });

    if (agentSelection !== 'all') {
      params.append('agent_ids', agentSelection);
    }

    try {
      const response = await fetch(
        `${CONVOSO_CONFIG.API_BASE}/calls?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${CONVOSO_CONFIG.API_KEY}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Convoso API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.data?.entries) {
        calls.push(...data.data.entries);

        if (data.data.entries.length < pageSize) {
          break; // No more data
        }

        offset += pageSize;
      } else {
        break;
      }
    } catch (error) {
      console.error('Error fetching from Convoso:', error);
      break;
    }
  }

  return calls;
}

async function analyzeBatch(calls: any[], config: DiscoveryRequest) {
  const results = {
    pitches: 0,
    closes: 0,
    openingScore: 0,
    rebuttalFailures: 0,
    earlyHangups: 0,
    lyingDetected: 0,
    avgOpeningTime: 0,
    topPerformer: 0
  };

  for (const call of calls) {
    // Count pitches (calls that lasted long enough for a pitch)
    if (call.duration_sec >= 30) {
      results.pitches++;
    }

    // Count closes
    if (['SALE', 'APPOINTMENT_SET', 'INTERESTED'].includes(call.disposition)) {
      results.closes++;
    }

    // Early hangups
    if (call.duration_sec <= 15) {
      results.earlyHangups++;
    }

    // If we have transcript, do deeper analysis
    if (call.transcript && config.analyzeOpenings) {
      const openingAnalysis = analyzeOpening(call.transcript, call.duration_sec);
      results.openingScore += openingAnalysis.score;
      results.avgOpeningTime += openingAnalysis.duration;
    }

    // Rebuttal analysis
    if (call.transcript && config.trackRebuttals) {
      const rebuttalAnalysis = analyzeRebuttals(call.transcript);
      results.rebuttalFailures += rebuttalAnalysis.gave_up_count;
    }

    // Lying detection
    if (call.transcript && config.detectLying) {
      const lyingDetected = await detectLyingPatterns(call.transcript);
      if (lyingDetected) {
        results.lyingDetected++;
      }
    }
  }

  // Calculate averages
  if (calls.length > 0) {
    results.openingScore = results.openingScore / calls.length;
    results.avgOpeningTime = results.avgOpeningTime / calls.length;
  }

  return results;
}

async function detectLyingPatterns(transcript: string): Promise<boolean> {
  // Check for dental scam patterns
  for (const pattern of LYING_PATTERNS) {
    if (pattern.type === 'dental_scam') {
      for (const marker of pattern.markers) {
        if (transcript.toLowerCase().includes(marker)) {
          // Check if it's actually free or has hidden costs
          if (transcript.includes('membership') ||
              transcript.includes('enrollment') ||
              transcript.includes('monthly fee') ||
              transcript.includes('copay')) {
            return true; // Lying detected
          }
        }
      }
    }
  }

  return false;
}

async function updateSessionStatus(sessionId: string, status: string, data: any = {}) {
  await db.none(`
    UPDATE discovery_sessions
    SET status = $1,
        progress = $2,
        processed = $3,
        metrics = $4,
        insights = $5,
        updated_at = NOW()
    WHERE id = $6
  `, [
    status,
    data.progress || 0,
    data.processed || 0,
    JSON.stringify(data.metrics || {}),
    JSON.stringify(data.insights || []),
    sessionId
  ]);
}