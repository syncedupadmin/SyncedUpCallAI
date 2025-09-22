import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { sleep } from '@/server/lib/retry';
import { logInfo } from '@/lib/log';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check authorization for batch endpoint
  const authHeader = req.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.JOBS_SECRET}`;

  if (!authHeader || authHeader !== expectedAuth) {
    // Quick ignore to stop spamming logs
    return NextResponse.json({ ok: true, skipped: 'missing/invalid auth' }, { status: 200 });
  }

  // Get batch size from query params, default to 50
  const batchSize = parseInt(req.nextUrl.searchParams.get('batch_size') || '50');
  const includeShortCalls = req.nextUrl.searchParams.get('include_short') === 'true';

  // Build query based on options
  // When includeShortCalls is true, include calls ≥3 seconds for rejection analysis
  const durationCondition = includeShortCalls ? 'and c.duration_sec >= 3' : 'and c.duration_sec >= 10';

  const { rows } = await db.query(`
    with eligible as (
      select c.id, c.recording_url, c.duration_sec, c.created_at
      from calls c
      left join transcripts t on t.call_id = c.id
      left join transcription_queue tq on tq.call_id = c.id
      where c.started_at > now() - interval '30 days'  -- Extended to 30 days
        ${durationCondition}
        and c.recording_url is not null
        and t.call_id is null
        and (tq.call_id is null or tq.status = 'failed')  -- Not already in queue or failed
      order by
        -- Prioritize short rejection calls when includeShortCalls is true
        ${includeShortCalls ? 'case when c.duration_sec between 3 and 30 then 0 else 1 end,' : ''}
        c.created_at desc,  -- Prioritize recent calls
        c.duration_sec desc  -- Then longer calls (likely more important)
      limit $1
    )
    select * from eligible
  `, [batchSize]);

  let scanned = rows.length;
  let posted = 0;
  let failed = 0;
  let completed = 0;

  // Initialize batch tracking in database
  const newBatchId = `batch_${Date.now()}`;

  // Create batch progress record in database
  await db.none(`
    INSERT INTO batch_progress (batch_id, total, scanned, posted, completed, failed, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [newBatchId, scanned, scanned, 0, 0, 0, 'processing']);

  for (const r of rows) {
    try {
      // Add to transcription queue instead of directly calling transcribe
      // Priority based on recency and duration
      const hoursSinceCreation = Math.floor((Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60));
      const priority = Math.max(0, 5 - hoursSinceCreation); // Recent calls get higher priority

      await db.none(`
        SELECT queue_transcription($1, $2, $3, $4)
      `, [r.id, r.recording_url, priority, 'batch']);

      posted++;
      completed++; // Count as completed since we queued it

      // Update progress in database
      await db.none(`
        UPDATE batch_progress
        SET posted = $2, completed = $3, failed = $4, updated_at = NOW()
        WHERE batch_id = $1
      `, [newBatchId, posted, completed, failed]);

      logInfo({
        event_type: 'batch_transcription_queued',
        call_id: r.id,
        duration_sec: r.duration_sec,
        is_short_call: r.duration_sec < 30,
        priority,
        source: 'batch'
      });

      // Small delay between queuing
      if (rows.indexOf(r) < rows.length - 1) {
        await sleep(50);
      }
    } catch (error) {
      failed++;
      console.error(`Batch queue error for ${r.id}:`, error);

      // Update failed count in database
      await db.none(`
        UPDATE batch_progress
        SET failed = $2, updated_at = NOW()
        WHERE batch_id = $1
      `, [newBatchId, failed]);
    }
  }

  // Mark batch as complete
  await db.none(`
    UPDATE batch_progress
    SET status = 'complete', updated_at = NOW()
    WHERE batch_id = $1
  `, [newBatchId]);

  return NextResponse.json({
    ok: true,
    batch_id: newBatchId,
    progress: {
      scanned,
      posted,
      completed,
      failed,
      total: scanned
    }
  });
}
