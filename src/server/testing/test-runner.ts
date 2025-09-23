import { Client } from "pg";
import fetch from "node-fetch";
import { wer } from "./wer.js";

const JOBS_SECRET = process.env.JOBS_SECRET!;
const DB = process.env.DATABASE_URL!;

async function wait(ms:number){ return new Promise(r=>setTimeout(r,ms)); }

export async function runTestCase({ test_case_id, suite_run_id }:{
  test_case_id: string; suite_run_id: string;
}){
  const client = new Client({ connectionString: DB }); await client.connect();

  const { rows: cases } = await client.query(
    "select id, audio_url, coalesce(audio_duration_sec,30) as dur, expected_transcript from ai_test_cases where id=$1",
    [test_case_id]
  );
  if(!cases.length) throw new Error("Test case not found");
  const tc = cases[0];

  // 1) create test run
  const { rows: trRows } = await client.query(
    "insert into ai_test_runs (test_case_id, suite_run_id, status) values ($1,$2,'running') returning id",
    [test_case_id, suite_run_id]
  );
  const test_run_id = trRows[0].id;

  try {
    // 2) create synthetic call with office_id = 1
    const { rows: callRows } = await client.query(
      `insert into calls (recording_url, duration_sec, office_id, agent_name, source, is_test, analyzed_at, created_at)
       values ($1,$2,1,'TEST_AGENT','ai_test',true, now(), now())
       returning id`,
      [tc.audio_url, tc.dur]
    );
    const callId = callRows[0].id;

    await client.query("update ai_test_runs set call_id=$2 where id=$1", [test_run_id, callId]);

    // 3) trigger transcription with auth
    const body = { callId, recordingUrl: tc.audio_url };
    const resp = await fetch(`${process.env.BASE_URL || "http://localhost:3000"}/api/jobs/transcribe`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${JOBS_SECRET}` },
      body: JSON.stringify(body)
    });
    if(!resp.ok){
      const txt = await resp.text();
      throw new Error(`transcribe HTTP ${resp.status}: ${txt}`);
    }

    // 4) poll transcripts table for result (max ~2 min)
    const started = Date.now();
    let transcriptRow:any; let lastCount = 0;
    while(Date.now() - started < 120000){
      const r = await client.query("select text as transcript from transcripts where call_id=$1 order by created_at desc limit 1", [callId]);
      if(r.rows.length && r.rows[0].transcript){
        transcriptRow = r.rows[0]; break;
      }
      // optional: count jobs or logs if you store them
      await wait(3000);
      lastCount++;
    }
    if(!transcriptRow) throw new Error("Timeout waiting for transcript");

    const actual = transcriptRow.transcript as string;

    // 5) compute WER if expected exists
    let w = null;
    if(tc.expected_transcript && tc.expected_transcript.trim().length){
      w = wer(tc.expected_transcript, actual);
    }

    // 6) store success
    await client.query(
      "update ai_test_runs set status='completed', actual_transcript=$2, transcript_wer=$3 where id=$1",
      [test_run_id, actual, w]
    );

  } catch (e:any) {
    await client.query(
      "update ai_test_runs set status='failed', error_message=$2 where id=$1",
      [test_run_id, String(e?.stack || e?.message || e)]
    );
    throw e;
  } finally {
    await client.end();
  }
}