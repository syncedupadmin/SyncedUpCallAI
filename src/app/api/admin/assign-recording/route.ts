import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { recording_id, call_id } = await req.json();

    if (!recording_id || !call_id) {
      return NextResponse.json({
        ok: false,
        error: 'recording_id and call_id are required'
      }, { status: 400 });
    }

    // Get the recording details
    const recording = await db.oneOrNone(`
      SELECT
        id,
        recording_url,
        recording_id as conv_recording_id,
        start_time,
        end_time,
        duration_seconds
      FROM unmatched_recordings
      WHERE id = $1
    `, [recording_id]);

    if (!recording) {
      return NextResponse.json({
        ok: false,
        error: 'Recording not found'
      }, { status: 404 });
    }

    // Begin transaction
    await db.tx(async t => {
      // Update the call with the recording
      await t.none(`
        UPDATE calls
        SET
          recording_url = $1,
          recording_matched_at = NOW(),
          recording_match_confidence = 'manual',
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{recording_match}',
            $2::jsonb
          ),
          updated_at = NOW()
        WHERE id = $3
      `, [
        recording.recording_url,
        JSON.stringify({
          recording_id: recording.conv_recording_id,
          match_reason: 'Manual assignment by admin',
          matched_at: new Date().toISOString(),
          matched_by: 'admin'
        }),
        call_id
      ]);

      // Mark the unmatched recording as reviewed
      await t.none(`
        UPDATE unmatched_recordings
        SET
          reviewed = TRUE,
          reviewed_at = NOW(),
          assigned_to_call_id = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [call_id, recording_id]);
    });

    console.log(`[MANUAL MATCH] Assigned recording ${recording.conv_recording_id} to call ${call_id}`);

    return NextResponse.json({
      ok: true,
      message: 'Recording assigned successfully',
      recording_id: recording.conv_recording_id,
      call_id
    });

  } catch (error: any) {
    console.error('Error assigning recording:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}