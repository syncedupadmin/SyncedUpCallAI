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

    // Get last 3 sessions to compare
    const { data: sessions } = await sbAdmin
      .from('discovery_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(3);

    if (!sessions || sessions.length < 2) {
      return NextResponse.json({ error: 'Not enough sessions to compare' }, { status: 404 });
    }

    // For each session, get detailed call breakdown
    const sessionDetails = await Promise.all(
      sessions.map(async (session) => {
        // Get call counts by status
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

        // Get calls WITH recordings vs WITHOUT
        const [withRecordings, withoutRecordings] = await Promise.all([
          sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
            .eq('session_id', session.id).not('recording_url', 'is', null),
          sbAdmin.from('discovery_calls').select('*', { count: 'exact', head: true })
            .eq('session_id', session.id).is('recording_url', null)
        ]);

        // Get sample calls with recordings
        const { data: sampleWithRecordings } = await sbAdmin
          .from('discovery_calls')
          .select('call_id, recording_url, processing_status')
          .eq('session_id', session.id)
          .not('recording_url', 'is', null)
          .limit(3);

        // Get sample calls without recordings
        const { data: sampleWithoutRecordings } = await sbAdmin
          .from('discovery_calls')
          .select('call_id, recording_url, processing_status')
          .eq('session_id', session.id)
          .is('recording_url', null)
          .limit(3);

        // Get failure reasons
        const { data: failures } = await sbAdmin
          .from('discovery_calls')
          .select('error_message')
          .eq('session_id', session.id)
          .eq('processing_status', 'failed');

        const errorBreakdown = (failures || []).reduce((acc: any, f: any) => {
          const msg = f.error_message || 'Unknown';
          acc[msg] = (acc[msg] || 0) + 1;
          return acc;
        }, {});

        return {
          id: session.id,
          agency_id: session.agency_id,
          status: session.status,
          total_calls: session.total_calls,
          processed: session.processed,
          progress: session.progress,
          error_message: session.error_message,
          started_at: session.started_at,
          completed_at: session.completed_at,
          config: session.config,
          call_status: {
            pending: pending.count || 0,
            processing: processing.count || 0,
            completed: completed.count || 0,
            failed: failed.count || 0
          },
          recording_availability: {
            with_recordings: withRecordings.count || 0,
            without_recordings: withoutRecordings.count || 0,
            percentage_with_recordings: Math.round(((withRecordings.count || 0) / session.total_calls) * 100)
          },
          sample_with_recordings: sampleWithRecordings || [],
          sample_without_recordings: sampleWithoutRecordings || [],
          failure_breakdown: errorBreakdown
        };
      })
    );

    // Compare sessions
    const comparison = {
      total_sessions: sessionDetails.length,
      sessions: sessionDetails,
      key_differences: []
    };

    // Identify key differences
    if (sessionDetails.length >= 2) {
      const latest = sessionDetails[0];
      const previous = sessionDetails[1];

      // Compare recording availability
      if (latest.recording_availability.percentage_with_recordings !== previous.recording_availability.percentage_with_recordings) {
        comparison.key_differences.push({
          metric: 'Recording Availability',
          latest: `${latest.recording_availability.percentage_with_recordings}% (${latest.recording_availability.with_recordings}/${latest.total_calls})`,
          previous: `${previous.recording_availability.percentage_with_recordings}% (${previous.recording_availability.with_recordings}/${previous.total_calls})`,
          difference: latest.recording_availability.percentage_with_recordings - previous.recording_availability.percentage_with_recordings
        });
      }

      // Compare success rates
      const latestSuccessRate = Math.round((latest.call_status.completed / latest.total_calls) * 100);
      const previousSuccessRate = Math.round((previous.call_status.completed / previous.total_calls) * 100);

      if (latestSuccessRate !== previousSuccessRate) {
        comparison.key_differences.push({
          metric: 'Success Rate',
          latest: `${latestSuccessRate}% (${latest.call_status.completed}/${latest.total_calls})`,
          previous: `${previousSuccessRate}% (${previous.call_status.completed}/${previous.total_calls})`,
          difference: latestSuccessRate - previousSuccessRate
        });
      }

      // Compare configurations
      if (JSON.stringify(latest.config) !== JSON.stringify(previous.config)) {
        comparison.key_differences.push({
          metric: 'Configuration',
          latest: latest.config,
          previous: previous.config,
          difference: 'Config changed'
        });
      }
    }

    return NextResponse.json(comparison);

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to compare sessions' },
      { status: 500 }
    );
  }
}
