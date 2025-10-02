import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Get latest session
    const { data: sessions, error: sessionError } = await sbAdmin
      .from('discovery_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1);

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ message: 'No discovery sessions found' });
    }

    const session = sessions[0];

    // Get call status breakdown
    const { data: calls, error: callsError } = await sbAdmin
      .from('discovery_calls')
      .select('processing_status, error_message, call_id, attempts')
      .eq('session_id', session.id);

    if (callsError) {
      return NextResponse.json({ error: callsError.message }, { status: 500 });
    }

    const statusBreakdown = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };

    const errorCounts: Record<string, number> = {};
    const sampleErrors: any[] = [];

    calls?.forEach(call => {
      statusBreakdown[call.processing_status as keyof typeof statusBreakdown]++;

      if (call.processing_status === 'failed' && call.error_message) {
        const errorKey = call.error_message.substring(0, 100);
        errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;

        if (sampleErrors.length < 5) {
          sampleErrors.push({
            call_id: call.call_id,
            attempts: call.attempts,
            error: call.error_message
          });
        }
      }
    });

    const topErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([error, count]) => ({ error, count }));

    return NextResponse.json({
      session: {
        id: session.id,
        agency_id: session.agency_id,
        status: session.status,
        total_calls: session.total_calls,
        processed: session.processed,
        progress: session.progress,
        error_message: session.error_message,
        started_at: session.started_at,
        completed_at: session.completed_at
      },
      status_breakdown: statusBreakdown,
      top_errors: topErrors,
      sample_errors: sampleErrors
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch discovery errors' },
      { status: 500 }
    );
  }
}
