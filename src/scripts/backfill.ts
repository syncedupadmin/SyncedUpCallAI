#!/usr/bin/env tsx
import 'dotenv/config';
import { db } from '../server/db.js';

async function main(){
  const { rows } = await db.query(`
    select id, recording_url from calls c
    left join transcripts t on t.call_id=c.id
    where c.started_at > now() - interval '30 days'
      and c.duration_sec >= 10
      and c.recording_url is not null
      and t.call_id is null
    limit 500
  `);
  for (const r of rows) {
    await fetch(`${process.env.APP_URL}/api/jobs/transcribe`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.JOBS_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: r.id, recordingUrl: r.recording_url })
    });
    console.log('queued', r.id);
  }
}
main().then(()=>process.exit(0)).catch(e=>{ console.error(e); process.exit(1); });
