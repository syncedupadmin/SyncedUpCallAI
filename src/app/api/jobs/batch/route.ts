import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { sleep } from '@/src/server/lib/retry';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check authorization for batch endpoint
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.JOBS_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
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

  for (const r of rows) {
    try {
      const resp = await fetch(`${process.env.APP_URL}/api/jobs/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.JOBS_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: r.id, recordingUrl: r.recording_url })
      });
      
      if (resp.ok) {
        posted++;
      } else {
        failed++;
        console.error(`Batch transcribe failed for ${r.id}:`, await resp.text());
      }
      
      // Add delay between requests to avoid overwhelming ASR services
      if (rows.indexOf(r) < rows.length - 1) {
        await sleep(200);
      }
    } catch (error) {
      failed++;
      console.error(`Batch transcribe error for ${r.id}:`, error);
    }
  }

  return NextResponse.json({ 
    ok: true, 
    scanned,
    posted,
    failed
  });
}
