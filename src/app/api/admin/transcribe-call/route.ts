import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { logInfo, logError } from '@/src/lib/log';

export const dynamic = 'force-dynamic';

// Manual trigger endpoint for transcribing specific calls
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { call_id, priority = 100 } = body; // Default to urgent priority for manual triggers

    if (!call_id) {
      return NextResponse.json({
        ok: false,
        error: 'call_id is required'
      }, { status: 400 });
    }

    // Get call details
    const call = await db.oneOrNone(`
      SELECT id, recording_url, duration_sec, agent_name, campaign, disposition
      FROM calls
      WHERE id = $1 OR call_id = $1
    `, [call_id]);

    if (!call) {
      return NextResponse.json({
        ok: false,
        error: 'Call not found'
      }, { status: 404 });
    }

    if (!call.recording_url) {
      return NextResponse.json({
        ok: false,
        error: 'Call has no recording URL'
      }, { status: 400 });
    }

    // Check if already transcribed
    const existingTranscript = await db.oneOrNone(`
      SELECT call_id, created_at
      FROM transcripts
      WHERE call_id = $1
    `, [call.id]);

    if (existingTranscript) {
      return NextResponse.json({
        ok: true,
        status: 'already_transcribed',
        transcribed_at: existingTranscript.created_at
      });
    }

    // Check if already in queue
    const existingQueue = await db.oneOrNone(`
      SELECT id, status, priority, created_at, attempts
      FROM transcription_queue
      WHERE call_id = $1
    `, [call.id]);

    if (existingQueue && existingQueue.status !== 'failed') {
      // Update priority if manual trigger has higher priority
      if (priority > existingQueue.priority) {
        await db.none(`
          UPDATE transcription_queue
          SET priority = $1
          WHERE id = $2
        `, [priority, existingQueue.id]);

        logInfo({
          event_type: 'manual_transcription_priority_updated',
          call_id: call.id,
          old_priority: existingQueue.priority,
          new_priority: priority,
          source: 'admin'
        });

        return NextResponse.json({
          ok: true,
          status: 'priority_updated',
          queue_status: existingQueue.status,
          old_priority: existingQueue.priority,
          new_priority: priority
        });
      }

      return NextResponse.json({
        ok: true,
        status: 'already_queued',
        queue_status: existingQueue.status,
        priority: existingQueue.priority,
        attempts: existingQueue.attempts
      });
    }

    // Add to transcription queue with urgent priority
    const result = await db.oneOrNone(`
      SELECT queue_transcription($1, $2, $3, $4) as queued
    `, [call.id, call.recording_url, priority, 'manual']);

    if (result?.queued) {
      logInfo({
        event_type: 'manual_transcription_queued',
        call_id: call.id,
        priority,
        duration_sec: call.duration_sec,
        agent: call.agent_name,
        campaign: call.campaign,
        source: 'admin'
      });

      return NextResponse.json({
        ok: true,
        status: 'queued',
        call_id: call.id,
        priority,
        recording_url: call.recording_url,
        call_details: {
          duration_sec: call.duration_sec,
          agent: call.agent_name,
          campaign: call.campaign,
          disposition: call.disposition
        }
      });
    } else {
      return NextResponse.json({
        ok: false,
        error: 'Failed to queue transcription'
      }, { status: 500 });
    }

  } catch (error: any) {
    logError('Manual transcription trigger failed', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// GET endpoint to check transcription status
export async function GET(req: NextRequest) {
  try {
    const call_id = req.nextUrl.searchParams.get('call_id');

    if (!call_id) {
      // Return queue summary if no specific call_id
      const summary = await db.oneOrNone(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'processing') as processing,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_recent,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          MIN(created_at) FILTER (WHERE status = 'pending') as oldest_pending
        FROM transcription_queue
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const queueDetails = await db.manyOrNone(`
        SELECT
          tq.call_id,
          tq.status,
          tq.priority,
          tq.attempts,
          tq.source,
          tq.created_at,
          EXTRACT(EPOCH FROM (NOW() - tq.created_at))/60 as wait_minutes,
          c.agent_name,
          c.duration_sec,
          c.disposition
        FROM transcription_queue tq
        LEFT JOIN calls c ON c.id = tq.call_id
        WHERE tq.status IN ('pending', 'processing')
        ORDER BY tq.priority DESC, tq.created_at ASC
        LIMIT 20
      `);

      return NextResponse.json({
        ok: true,
        summary,
        active_queue: queueDetails
      });
    }

    // Check specific call status
    const call = await db.oneOrNone(`
      SELECT id, recording_url, duration_sec
      FROM calls
      WHERE id = $1 OR call_id = $1
    `, [call_id]);

    if (!call) {
      return NextResponse.json({
        ok: false,
        error: 'Call not found'
      }, { status: 404 });
    }

    // Check transcript status
    const transcript = await db.oneOrNone(`
      SELECT created_at, engine, lang, char_length(text) as text_length
      FROM transcripts
      WHERE call_id = $1
    `, [call.id]);

    // Check queue status
    const queueStatus = await db.oneOrNone(`
      SELECT status, priority, attempts, created_at, started_at, completed_at, last_error
      FROM transcription_queue
      WHERE call_id = $1
    `, [call.id]);

    // Check analysis status
    const analysis = await db.oneOrNone(`
      SELECT created_at, qa_score
      FROM analyses
      WHERE call_id = $1
    `, [call.id]);

    return NextResponse.json({
      ok: true,
      call_id: call.id,
      has_recording: !!call.recording_url,
      duration_sec: call.duration_sec,
      transcript: transcript ? {
        status: 'completed',
        created_at: transcript.created_at,
        engine: transcript.engine,
        language: transcript.lang,
        text_length: transcript.text_length
      } : null,
      queue: queueStatus,
      analysis: analysis ? {
        status: 'completed',
        created_at: analysis.created_at,
        qa_score: analysis.qa_score
      } : null
    });

  } catch (error: any) {
    logError('Transcription status check failed', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}