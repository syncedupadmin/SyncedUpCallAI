import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { logInfo, logError } from '@/lib/log';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Find bulk uploaded calls without recordings that aren't already queued
    const callsToQueue = await db.manyOrNone(`
      SELECT
        c.call_id,
        c.lead_id,
        c.started_at,
        c.ended_at,
        c.duration_sec
      FROM calls c
      LEFT JOIN pending_recordings pr ON (
        pr.call_id = c.call_id
        OR (pr.lead_id = c.lead_id AND c.call_id IS NULL)
      )
      WHERE c.source = 'bulk_upload'
        AND c.recording_url IS NULL
        AND pr.id IS NULL
        AND (c.lead_id IS NOT NULL OR c.call_id IS NOT NULL)
      LIMIT 500
    `);

    if (callsToQueue.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No calls need recording queue',
        queued: 0
      });
    }

    // Batch insert into pending_recordings
    const values = callsToQueue.map((call, idx) => {
      const base = idx * 9;
      return `($${base + 1}, $${base + 2}, $${base + 3}, NOW(), $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
    }).join(',');

    const params = callsToQueue.flatMap(call => {
      // Calculate scheduling based on whether call has ended
      const hasEnded = !!(call.ended_at || (call.duration_sec && call.duration_sec > 0));
      const callStartTime = call.started_at ? new Date(call.started_at) : new Date();
      const callEndTime = call.ended_at ? new Date(call.ended_at) : null;

      let scheduledFor;
      let estimatedEndTime = null;

      if (hasEnded) {
        // Call has ended, schedule immediately
        scheduledFor = new Date();
      } else {
        // Call might be ongoing, estimate end time
        const avgCallDurationMinutes = 5;
        estimatedEndTime = new Date(callStartTime.getTime() + (avgCallDurationMinutes * 60 * 1000));
        // Schedule 2 minutes after estimated end
        scheduledFor = new Date(estimatedEndTime.getTime() + (2 * 60 * 1000));
      }

      return [
        call.call_id || null,
        call.lead_id || null,
        0, // attempts
        scheduledFor,
        callStartTime,
        callEndTime,
        estimatedEndTime,
        'quick', // retry_phase
        'bulk_queue' // last_error/note
      ];
    });

    const query = `
      INSERT INTO pending_recordings (
        call_id, lead_id, attempts, created_at, scheduled_for,
        call_started_at, call_ended_at, estimated_end_time, retry_phase, last_error
      ) VALUES ${values}
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    const inserted = await db.manyOrNone(query, params);

    logInfo({
      event_type: 'bulk_recordings_queued',
      total_found: callsToQueue.length,
      successfully_queued: inserted.length,
      source: 'queue-bulk-recordings'
    });

    return NextResponse.json({
      success: true,
      message: `Queued ${inserted.length} calls for recording fetch`,
      found: callsToQueue.length,
      queued: inserted.length,
      duplicates: callsToQueue.length - inserted.length
    });

  } catch (error: any) {
    logError('Failed to queue bulk recordings', error);
    return NextResponse.json(
      { error: error.message || 'Failed to queue recordings' },
      { status: 500 }
    );
  }
}

// GET endpoint to check status
export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Get statistics
    const stats = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM calls WHERE source = 'bulk_upload' AND recording_url IS NULL) as needs_recording,
        (SELECT COUNT(*) FROM pending_recordings WHERE processed_at IS NULL) as pending_queue,
        (SELECT COUNT(*) FROM pending_recordings WHERE processed_at IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours') as processed_24h,
        (SELECT COUNT(*) FROM calls WHERE source = 'bulk_upload' AND recording_url IS NOT NULL AND created_at > NOW() - INTERVAL '24 hours') as recordings_found_24h
    `);

    return NextResponse.json({
      success: true,
      stats: {
        bulk_calls_need_recording: parseInt(stats.needs_recording),
        currently_in_queue: parseInt(stats.pending_queue),
        processed_last_24h: parseInt(stats.processed_24h),
        recordings_found_last_24h: parseInt(stats.recordings_found_24h)
      }
    });
  } catch (error: any) {
    logError('Failed to get queue stats', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get stats' },
      { status: 500 }
    );
  }
}