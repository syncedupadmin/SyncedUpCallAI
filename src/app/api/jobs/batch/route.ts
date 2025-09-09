import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export async function GET() {
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
      limit 200
    )
    select * from eligible
  `);

  for (const r of rows) {
    await fetch(`${process.env.APP_URL}/api/jobs/transcribe`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.JOBS_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: r.id, recordingUrl: r.recording_url })
    });
  }

  return NextResponse.json({ ok: true, queued: rows.length });
}
