import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Verify super admin access
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized - not super admin' }, { status: 401 });
    }

    // Get session_id from query params
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 });
    }

    // Get session details
    const { data: session, error: sessionError } = await sbAdmin
      .from('discovery_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get recent failed calls with error messages
    const { data: failedCalls, error: failedError } = await sbAdmin
      .from('discovery_calls')
      .select('call_id, error_message, attempts, created_at, processed_at')
      .eq('session_id', sessionId)
      .eq('processing_status', 'failed')
      .order('created_at', { ascending: false })
      .limit(50);

    // Group errors by message
    const errorBreakdown: Record<string, { count: number; samples: string[] }> = {};

    (failedCalls || []).forEach(call => {
      const msg = call.error_message || 'Unknown error';
      if (!errorBreakdown[msg]) {
        errorBreakdown[msg] = { count: 0, samples: [] };
      }
      errorBreakdown[msg].count++;
      if (errorBreakdown[msg].samples.length < 5) {
        errorBreakdown[msg].samples.push(call.call_id);
      }
    });

    // Get status breakdown
    const [pending, processing, completed, failed] = await Promise.all([
      sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId).eq('processing_status', 'pending'),
      sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId).eq('processing_status', 'processing'),
      sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId).eq('processing_status', 'completed'),
      sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId).eq('processing_status', 'failed')
    ]);

    // Get recording availability stats
    const [withRecordings, withoutRecordings] = await Promise.all([
      sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId).not('recording_url', 'is', null),
      sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId).is('recording_url', null)
    ]);

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        error_message: session.error_message,
        progress: session.progress,
        processed: session.processed,
        total_calls: session.total_calls,
        started_at: session.started_at,
        completed_at: session.completed_at
      },
      status_breakdown: {
        pending: pending.count || 0,
        processing: processing.count || 0,
        completed: completed.count || 0,
        failed: failed.count || 0
      },
      recording_stats: {
        with_recordings: withRecordings.count || 0,
        without_recordings: withoutRecordings.count || 0,
        percentage: session.total_calls > 0
          ? Math.round(((withRecordings.count || 0) / session.total_calls) * 100)
          : 0
      },
      error_breakdown: Object.entries(errorBreakdown)
        .map(([error, data]) => ({ error, ...data }))
        .sort((a, b) => b.count - a.count),
      failed_calls_sample: (failedCalls || []).slice(0, 10),
      diagnostics: {
        is_stuck: session.status === 'initializing' &&
                  new Date().getTime() - new Date(session.started_at).getTime() > 120000, // 2 minutes
        stuck_reason: session.status === 'initializing'
          ? 'Session has been initializing for more than 2 minutes. Cron job may not be triggering queue-calls endpoint.'
          : null,
        has_calls_queued: (session.total_calls || 0) > 0,
        calls_with_recordings: (withRecordings.count || 0),
        suggested_action: session.status === 'initializing'
          ? 'Check Vercel cron logs for /api/cron/process-discovery-queue or manually trigger /api/discovery/queue-calls'
          : failed.count && failed.count > (completed.count || 0)
          ? 'Most calls are failing - check error breakdown above'
          : 'Session appears to be processing normally'
      }
    });

  } catch (error: any) {
    console.error('[Discovery Logs] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}
