import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Super Admin Discovery Sessions Management API
 * GET - List all discovery sessions with real-time stats
 * POST - Control actions (cancel, pause, resume, restart)
 */

export async function GET(req: NextRequest) {
  try {
    // Verify super admin access
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('[Super Admin] Auth error:', authError);
      return NextResponse.json({ error: 'Authentication failed', details: authError.message }, { status: 401 });
    }

    if (!user) {
      console.error('[Super Admin] No user found');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    console.log('[Super Admin] Checking access:', { userEmail: user.email, adminEmail, match: user.email === adminEmail });

    if (user.email !== adminEmail) {
      return NextResponse.json({ error: 'Unauthorized - not super admin' }, { status: 401 });
    }

    // Get all sessions with agency names and durations
    // Use explicit relationship name to avoid ambiguity (discovery_sessions.agency_id -> agencies.id)
    const { data: sessions, error: sessionsError } = await sbAdmin
      .from('discovery_sessions')
      .select(`
        *,
        agencies!discovery_sessions_agency_id_fkey (
          name
        )
      `)
      .order('started_at', { ascending: false })
      .limit(100);

    if (sessionsError) {
      console.error('[Super Admin] Error fetching sessions:', sessionsError);
      throw sessionsError;
    }

    // For each session, get queue stats using SQL COUNT aggregations
    const sessionsWithStats = await Promise.all(
      (sessions || []).map(async (session) => {
        // Use SQL COUNT aggregations instead of fetching all rows and filtering in JavaScript
        const [pending, processing, completed, failed] = await Promise.all([
          sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
            .eq('session_id', session.id).eq('processing_status', 'pending'),
          sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
            .eq('session_id', session.id).eq('processing_status', 'processing'),
          sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
            .eq('session_id', session.id).eq('processing_status', 'completed'),
          sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
            .eq('session_id', session.id).eq('processing_status', 'failed')
        ]);

        // If table doesn't exist, use fallback stats
        const queueStats = pending.error ? {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0
        } : {
          pending: pending.count || 0,
          processing: processing.count || 0,
          completed: completed.count || 0,
          failed: failed.count || 0
        };

        // Calculate duration
        const startTime = new Date(session.started_at).getTime();
        const endTime = session.completed_at
          ? new Date(session.completed_at).getTime()
          : Date.now();
        const duration_seconds = Math.floor((endTime - startTime) / 1000);

        return {
          id: session.id,
          agency_id: session.agency_id,
          agency_name: (session.agencies as any)?.name || 'Unknown',
          status: session.status,
          progress: session.progress || 0,
          processed: session.processed || 0,
          total_calls: session.total_calls,
          started_at: session.started_at,
          completed_at: session.completed_at,
          duration_seconds,
          queue_stats: queueStats,
          metrics: session.metrics || {},
          error_message: session.error_message,
          config: session.config
        };
      })
    );

    // Calculate system-wide stats
    const activeCount = sessionsWithStats.filter(s =>
      s.status === 'processing' || s.status === 'queued'
    ).length;

    const queuedCount = sessionsWithStats.filter(s =>
      s.status === 'queued'
    ).length;

    const today = new Date().toISOString().split('T')[0];
    const completedToday = sessionsWithStats.filter(s =>
      s.status === 'complete' &&
      s.started_at?.startsWith(today)
    ).length;

    const failedToday = sessionsWithStats.filter(s =>
      s.status === 'error' &&
      s.started_at?.startsWith(today)
    ).length;

    // Get total pending/processing/completed calls across all sessions using SQL COUNT aggregations
    const [totalPendingResult, totalProcessingResult, totalCompletedResult] = await Promise.all([
      sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
        .eq('processing_status', 'pending'),
      sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
        .eq('processing_status', 'processing'),
      sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
        .eq('processing_status', 'completed')
    ]);

    // Handle case where table doesn't exist yet
    const totalPending = totalPendingResult.error ? 0 : (totalPendingResult.count || 0);
    const totalProcessing = totalProcessingResult.error ? 0 : (totalProcessingResult.count || 0);
    const totalCompleted = totalCompletedResult.error ? 0 : (totalCompletedResult.count || 0);

    // Calculate average duration for completed sessions
    const completedSessions = sessionsWithStats.filter(s => s.status === 'complete' && s.duration_seconds);
    const avgDurationMinutes = completedSessions.length > 0
      ? Math.round(
          completedSessions.reduce((sum, s) => sum + s.duration_seconds, 0) /
          completedSessions.length / 60
        )
      : 0;

    return NextResponse.json({
      sessions: sessionsWithStats,
      system_stats: {
        active_count: activeCount,
        queued_count: queuedCount,
        completed_today: completedToday,
        failed_today: failedToday,
        total_pending_calls: totalPending,
        total_processing_calls: totalProcessing,
        total_completed_calls: totalCompleted,
        avg_duration_minutes: avgDurationMinutes
      }
    });

  } catch (error: any) {
    console.error('[Super Admin] Discovery sessions error:', error);
    console.error('[Super Admin] Error stack:', error.stack);
    console.error('[Super Admin] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch discovery sessions',
        details: error.details,
        code: error.code,
        hint: error.hint
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify super admin access
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, session_id } = body;

    if (!action || !session_id) {
      return NextResponse.json(
        { error: 'Missing action or session_id' },
        { status: 400 }
      );
    }

    console.log(`[Super Admin] Discovery action: ${action} on session ${session_id}`);

    switch (action) {
      case 'cancel':
        // Cancel session and all pending/processing calls
        await sbAdmin
          .from('discovery_sessions')
          .update({
            status: 'cancelled',
            error_message: 'Cancelled by super admin'
          })
          .eq('id', session_id);

        // Try to update discovery_calls if table exists
        const { error: callsUpdateError } = await sbAdmin
          .from('discovery_calls')
          .update({ processing_status: 'failed', error_message: 'Session cancelled' })
          .eq('session_id', session_id)
          .in('processing_status', ['pending', 'processing']);

        // Ignore error if table doesn't exist yet
        if (callsUpdateError && !callsUpdateError.message?.includes('does not exist')) {
          console.error('[Super Admin] Error updating calls:', callsUpdateError);
        }

        return NextResponse.json({
          success: true,
          message: 'Session cancelled'
        });

      case 'pause':
        // Pause session (cron will skip paused sessions)
        await sbAdmin
          .from('discovery_sessions')
          .update({ status: 'paused' })
          .eq('id', session_id);

        return NextResponse.json({
          success: true,
          message: 'Session paused'
        });

      case 'resume':
        // Resume paused session
        await sbAdmin
          .from('discovery_sessions')
          .update({ status: 'processing' })
          .eq('id', session_id)
          .eq('status', 'paused');

        return NextResponse.json({
          success: true,
          message: 'Session resumed'
        });

      case 'restart':
        // Reset session and all calls
        await sbAdmin
          .from('discovery_sessions')
          .update({
            status: 'queued',
            progress: 5,
            processed: 0,
            metrics: null,
            error_message: null,
            completed_at: null
          })
          .eq('id', session_id);

        // Reset all calls to pending (if table exists)
        const { error: restartCallsError } = await sbAdmin
          .from('discovery_calls')
          .update({
            processing_status: 'pending',
            recording_url: null,
            transcript: null,
            analysis: null,
            error_message: null,
            attempts: 0,
            processed_at: null
          })
          .eq('session_id', session_id);

        // Ignore error if table doesn't exist yet
        if (restartCallsError && !restartCallsError.message?.includes('does not exist')) {
          console.error('[Super Admin] Error restarting calls:', restartCallsError);
        }

        return NextResponse.json({
          success: true,
          message: 'Session restarted - processing will begin on next cron run'
        });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error: any) {
    console.error('[Super Admin] Discovery action error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to perform action' },
      { status: 500 }
    );
  }
}
