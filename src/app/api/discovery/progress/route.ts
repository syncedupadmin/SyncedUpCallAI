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
    const metrics = typeof session.metrics === 'string'
      ? JSON.parse(session.metrics)
      : session.metrics;

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