import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionId = req.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId parameter' }, { status: 400 });
    }

    // Get session with RLS check (automatically filters to user's agency)
    const { data: session, error } = await supabase
      .from('discovery_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.error('[Discovery Progress] Query error:', error);
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found or access denied' }, { status: 404 });
    }

    // Parse JSONB fields
    let metrics = typeof session.metrics === 'string'
      ? JSON.parse(session.metrics)
      : session.metrics;

    // If session is still processing, calculate partial metrics from completed calls
    if (session.status === 'processing' || session.status === 'queued') {
      const { data: completedCalls } = await supabase
        .from('discovery_calls')
        .select('analysis, call_length')
        .eq('session_id', sessionId)
        .eq('processing_status', 'completed')
        .limit(1000); // Limit to avoid overload

      if (completedCalls && completedCalls.length > 0) {
        // Calculate partial metrics (same logic as finalization in cron)
        metrics = calculatePartialMetrics(completedCalls);
      }
    }

    const insights = typeof session.insights === 'string'
      ? JSON.parse(session.insights)
      : session.insights;

    return NextResponse.json({
      status: session.status,
      progress: session.progress || 0,
      processed: session.processed || 0,
      total: session.total_calls,
      metrics: metrics || {},
      insights: insights || [],
      complete: session.status === 'complete',
      error: session.error_message,
      startedAt: session.started_at,
      completedAt: session.completed_at
    });

  } catch (error: any) {
    console.error('[Discovery Progress] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}

/**
 * Calculate partial metrics from completed calls (for live progress updates)
 */
function calculatePartialMetrics(calls: any[]) {
  let pitchesDelivered = 0;
  let successfulCloses = 0;
  let earlyHangups = 0;
  let lyingDetected = 0;
  let totalQAScore = 0;
  let qaCount = 0;

  for (const call of calls) {
    const duration = call.call_length || 0;
    const analysis = call.analysis || {};

    if (duration >= 30) pitchesDelivered++;
    if (duration <= 15) earlyHangups++;

    const outcome = analysis.analysis?.outcome || analysis.outcome;
    if (outcome === 'sale' || outcome === 'callback') {
      successfulCloses++;
    }

    if (analysis.qa_score) {
      totalQAScore += analysis.qa_score;
      qaCount++;
    }

    const redFlags = analysis.red_flags || analysis.risk_flags || [];
    if (
      redFlags.includes('misrepresentation_risk') ||
      redFlags.includes('confused') ||
      redFlags.includes('misleading')
    ) {
      lyingDetected++;
    }
  }

  return {
    totalCallsProcessed: calls.length,
    pitchesDelivered,
    successfulCloses,
    closeRate: pitchesDelivered > 0 ? Math.round((successfulCloses / pitchesDelivered) * 100) : 0,
    openingScore: qaCount > 0 ? Math.round(totalQAScore / qaCount) : 0,
    earlyHangups,
    hangupRate: calls.length > 0 ? Math.round((earlyHangups / calls.length) * 100) : 0,
    lyingDetected,
    rebuttalFailures: 0
  };
}