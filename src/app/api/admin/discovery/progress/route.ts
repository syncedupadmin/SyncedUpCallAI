import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sessionId = req.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    // Get session data
    const session = await db.oneOrNone(`
      SELECT
        id,
        status,
        progress,
        processed,
        total_calls,
        metrics,
        insights,
        started_at,
        updated_at
      FROM discovery_sessions
      WHERE id = $1
    `, [sessionId]);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Parse JSON fields
    const metrics = session.metrics || {};
    const insights = session.insights || [];

    // Check for new insights since last check
    const lastCheckTime = req.nextUrl.searchParams.get('lastCheck');
    let newInsights: string[] = [];

    if (lastCheckTime && insights.length > 0) {
      // Simple approach: return latest insights if updated recently
      const timeSinceUpdate = Date.now() - new Date(session.updated_at).getTime();
      if (timeSinceUpdate < 5000) { // Updated in last 5 seconds
        newInsights = insights.slice(-3); // Last 3 insights
      }
    }

    return NextResponse.json({
      success: true,
      status: session.status,
      progress: session.progress || 0,
      processed: session.processed || 0,
      total: session.total_calls,
      complete: session.status === 'complete',
      error: session.status === 'error',
      metrics,
      insights,
      newInsights,
      startTime: session.started_at,
      lastUpdate: session.updated_at
    });

  } catch (error: any) {
    console.error('Progress check error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get progress' },
      { status: 500 }
    );
  }
}