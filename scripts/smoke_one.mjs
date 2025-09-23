import { Client } from "pg";
import fetch from "node-fetch";
const DB = process.env.DATABASE_URL; const JOBS_SECRET = process.env.JOBS_SECRET;
const mp3 = process.argv[2] || "https://synced-up-call-ai.vercel.app/test-audio/sample.mp3";
const client = new Client({ connectionString: DB }); await client.connect();
const { rows: callRows } = await client.query(
  `insert into calls (recording_url, duration_sec, office_id, agent_name, source, is_test, analyzed_at, created_at)
   values ($1,30,1,'TEST_AGENT','ai_test',true, now(), now()) returning id`, [mp3]
);
const callId = callRows[0].id;
const resp = await fetch(`${process.env.BASE_URL || "http://localhost:3000"}/api/jobs/transcribe`, {
  method:"POST",
  headers:{ "content-type":"application/json", "authorization":`Bearer ${JOBS_SECRET}`},
  body: JSON.stringify({ callId, recordingUrl: mp3 })
});
console.log("transcribe status", resp.status);
const started = Date.now();
while(Date.now()-started < 120000){
  const r = await client.query(`select engine, text, created_at from transcripts where call_id=$1 order by created_at desc limit 1`, [callId]);
  if(r.rows.length){ console.log("OK transcript from", r.rows[0].engine, "len", (r.rows[0].text||"").length); break; }
  await new Promise(r=>setTimeout(r,3000));
}
await client.end();
console.log("done");