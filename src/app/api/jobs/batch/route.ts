import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { sleep } from '@/src/server/lib/retry';
import { BatchProgressTracker } from '@/src/lib/sse';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check authorization for batch endpoint
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.JOBS_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Check if requesting progress update
  const batchId = req.nextUrl.searchParams.get('batch_id');
  if (batchId) {
    const progress = BatchProgressTracker.getProgress(batchId);
    if (!progress) {
      return NextResponse.json({ ok: false, error: 'batch_not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, progress });
  }

  const { rows } = await db.query(`
    with eligible as (
      select c.id, c.recording_url
      from calls c
      left join transcripts t on t.call_id = c.id
      where c.started_at > now() - interval '2 days'
        and c.duration_sec >= 10
        and c.recording_url is not null
        and t.call_id is null
      order by c.started_at desc
      limit 10
    )
    select * from eligible
  `);

  let scanned = rows.length;
  let posted = 0;
  let failed = 0;
  let completed = 0;

  // Initialize batch tracking
  const newBatchId = `batch_${Date.now()}`;
  BatchProgressTracker.initBatch(newBatchId, scanned);

  for (const r of rows) {
    try {
      const resp = await fetch(`${process.env.APP_URL}/api/jobs/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.JOBS_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: r.id, recordingUrl: r.recording_url })
      });
      
      if (resp.ok) {
        posted++;
        const result = await resp.json();
        if (result.ok) {
          completed++;
        }
        // Update progress
        BatchProgressTracker.updateProgress(newBatchId, { 
          posted, 
          completed,
          failed 
        });
      } else {
        failed++;
        console.error(`Batch transcribe failed for ${r.id}:`, await resp.text());
        BatchProgressTracker.updateProgress(newBatchId, { failed });
      }
      
      // Add delay between requests to avoid overwhelming ASR services
      if (rows.indexOf(r) < rows.length - 1) {
        await sleep(200);
      }
    } catch (error) {
      failed++;
      console.error(`Batch transcribe error for ${r.id}:`, error);
      BatchProgressTracker.updateProgress(newBatchId, { failed });
    }
  }

  const finalProgress = BatchProgressTracker.getProgress(newBatchId);

  return NextResponse.json({ 
    ok: true, 
    batch_id: newBatchId,
    progress: finalProgress,
    scanned,
    posted,
    completed,
    failed
  });
}
