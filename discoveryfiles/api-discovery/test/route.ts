import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { v4 as uuidv4 } from 'uuid';
import {
  analyzeOpening,
  analyzeRebuttals,
  detectHangups,
  LYING_PATTERNS
} from '@/lib/discovery-engine';

export const dynamic = 'force-dynamic';

// Test endpoint that uses existing database calls
export async function POST(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { callCount = 100 } = await req.json();
    const sessionId = uuidv4();

    // Create session
    await db.none(`
      INSERT INTO discovery_sessions (id, status, total_calls, started_at)
      VALUES ($1, 'analyzing', $2, NOW())
    `, [sessionId, callCount]);

    // Get existing calls from database for testing
    const calls = await db.manyOrNone(`
      SELECT
        c.id,
        c.call_id,
        c.duration_sec,
        c.disposition,
        c.agent_name,
        c.campaign,
        t.text as transcript
      FROM calls c
      LEFT JOIN transcripts t ON t.call_id = c.id
      WHERE c.duration_sec IS NOT NULL
      ORDER BY c.created_at DESC
      LIMIT $1
    `, [callCount]);

    console.log(`[Discovery Test] Processing ${calls.length} existing calls`);

    // Analyze calls
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

    const insights: string[] = [];
    let totalOpeningScore = 0;
    let openingsAnalyzed = 0;

    // Process each call
    for (const call of calls) {
      // Count pitches (calls > 30 seconds)
      if (call.duration_sec >= 30) {
        metrics.pitchesDelivered++;
      }

      // Count closes
      if (['SALE', 'APPOINTMENT_SET', 'INTERESTED'].includes(call.disposition)) {
        metrics.successfulCloses++;
      }

      // Early hangups
      if (call.duration_sec <= 15) {
        metrics.earlyHangups++;
      }

      // Analyze transcript if available
      if (call.transcript) {
        // Opening analysis
        const openingAnalysis = analyzeOpening(call.transcript, call.duration_sec);
        totalOpeningScore += openingAnalysis.score;
        openingsAnalyzed++;

        // Rebuttal analysis
        const rebuttalAnalysis = analyzeRebuttals(call.transcript);
        metrics.rebuttalFailures += rebuttalAnalysis.gave_up_count;

        // Lying detection for dental scams
        for (const pattern of LYING_PATTERNS) {
          if (pattern.type === 'dental_scam') {
            for (const marker of pattern.markers) {
              if (call.transcript.toLowerCase().includes(marker)) {
                metrics.lyingDetected++;
                insights.push(`Potential deception found: "${marker}" in call ${call.call_id}`);
                break;
              }
            }
          }
        }
      }
    }

    // Calculate final metrics
    if (metrics.pitchesDelivered > 0) {
      metrics.closeRate = (metrics.successfulCloses / metrics.pitchesDelivered) * 100;
    }

    if (openingsAnalyzed > 0) {
      metrics.openingScore = Math.round(totalOpeningScore / openingsAnalyzed);
    }

    // Hangup analysis
    const hangupAnalysis = detectHangups(calls);
    metrics.hangupRate = (hangupAnalysis.total_hangups / calls.length) * 100;

    // Generate insights
    insights.push(`Analyzed ${calls.length} calls from your database`);
    insights.push(`Close rate: ${metrics.closeRate.toFixed(1)}%`);
    insights.push(`${metrics.earlyHangups} calls ended in first 15 seconds`);

    if (hangupAnalysis.agent_caused_hangups > 0) {
      insights.push(`WARNING: ${hangupAnalysis.agent_caused_hangups} agent-caused hangups detected`);
    }

    if (metrics.rebuttalFailures > 0) {
      insights.push(`Agents gave up without rebuttals ${metrics.rebuttalFailures} times`);
    }

    // Update session with results
    await db.none(`
      UPDATE discovery_sessions
      SET status = 'complete',
          progress = 100,
          processed = $1,
          metrics = $2,
          insights = $3,
          completed_at = NOW()
      WHERE id = $4
    `, [calls.length, JSON.stringify(metrics), JSON.stringify(insights), sessionId]);

    return NextResponse.json({
      success: true,
      sessionId,
      metrics,
      insights,
      message: `Analyzed ${calls.length} calls from existing data`
    });

  } catch (error: any) {
    console.error('Discovery test error:', error);
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    );
  }
}