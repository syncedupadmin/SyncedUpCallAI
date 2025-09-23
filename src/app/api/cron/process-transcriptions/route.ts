import { NextResponse } from "next/server";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

async function withClient<T>(fn: (c: Client) => Promise<T>) {
  const c = new Client({ connectionString: process.env.DATABASE_URL! });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export async function GET(req: Request) {
  // Simple auth check for cron
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('[process-transcriptions] Unauthorized cron attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const out = await withClient(async (c) => {
    // Fetch a small batch to avoid timeouts
    const { rows: jobs } = await c.query(`
      UPDATE ai_transcription_jobs
      SET status='processing', updated_at=NOW()
      WHERE id IN (
        SELECT id FROM ai_transcription_jobs
        WHERE status='queued'
        ORDER BY id
        LIMIT 15
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, suite_run_id, test_run_id, call_id, audio_url, attempts
    `);

    console.log(`[process-transcriptions] Processing ${jobs.length} jobs`);

    let done = 0, failed = 0;

    for (const j of jobs) {
      try {
        console.log(`[process-transcriptions] Processing job ${j.id.substring(0, 8)} (attempt ${j.attempts + 1})`);

        // Trigger transcription
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.BASE_URL || "https://synced-up-call-ai.vercel.app";

        const resp = await fetch(`${baseUrl}/api/jobs/transcribe`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${process.env.JOBS_SECRET}`
          },
          body: JSON.stringify({ callId: j.call_id, recordingUrl: j.audio_url })
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`HTTP ${resp.status}: ${text}`);
        }

        // Poll transcripts table briefly (45s) then let next tick finish
        const started = Date.now();
        let got = false;
        let transcript = null;

        while (Date.now() - started < 45000) {
          const t = await c.query(
            `SELECT id, engine as provider, text as transcript
             FROM transcripts
             WHERE call_id=$1
             ORDER BY created_at DESC
             LIMIT 1`,
            [j.call_id]
          );

          if (t.rows.length && t.rows[0].transcript && t.rows[0].transcript.length > 0) {
            got = true;
            transcript = t.rows[0].transcript;
            break;
          }

          await new Promise(r => setTimeout(r, 3000));
        }

        if (got) {
          // Update test run with transcript
          await c.query(
            `UPDATE ai_test_runs
             SET status='completed', actual_transcript=$1
             WHERE id=$2`,
            [transcript, j.test_run_id]
          );

          // Calculate WER if expected transcript exists
          const testCase = await c.query(
            `SELECT expected_transcript
             FROM ai_test_cases tc
             JOIN ai_test_runs tr ON tr.test_case_id = tc.id
             WHERE tr.id = $1`,
            [j.test_run_id]
          );

          if (testCase.rows[0]?.expected_transcript) {
            // Simple WER calculation (you can use your existing WER function)
            const expected = testCase.rows[0].expected_transcript.toLowerCase().split(/\s+/);
            const actual = transcript.toLowerCase().split(/\s+/);
            const maxLen = Math.max(expected.length, actual.length);
            let errors = 0;

            for (let i = 0; i < maxLen; i++) {
              if (expected[i] !== actual[i]) errors++;
            }

            const wer = maxLen > 0 ? errors / maxLen : 0;

            await c.query(
              `UPDATE ai_test_runs SET transcript_wer=$1 WHERE id=$2`,
              [wer, j.test_run_id]
            );
          }

          // Mark job as done
          await c.query(
            `UPDATE ai_transcription_jobs
             SET status='done', updated_at=NOW()
             WHERE id=$1`,
            [j.id]
          );

          done++;
          console.log(`[process-transcriptions] Job ${j.id.substring(0, 8)} completed`);
        } else {
          // Leave as processing; next cron will see transcripts or retry
          await c.query(
            `UPDATE ai_transcription_jobs
             SET status='queued', attempts=attempts+1, updated_at=NOW()
             WHERE id=$1`,
            [j.id]
          );
          console.log(`[process-transcriptions] Job ${j.id.substring(0, 8)} still processing`);
        }
      } catch (e: any) {
        failed++;
        const giveUp = j.attempts + 1 >= 5;

        console.error(`[process-transcriptions] Job ${j.id.substring(0, 8)} failed:`, e.message);

        await c.query(
          `UPDATE ai_transcription_jobs
           SET status=$2, attempts=attempts+1, error_message=$3, updated_at=NOW()
           WHERE id=$1`,
          [j.id, giveUp ? 'failed' : 'queued', String(e?.message || e)]
        );

        // Mark test run as failed if we're giving up
        if (giveUp) {
          await c.query(
            `UPDATE ai_test_runs
             SET status='failed', error_message=$1
             WHERE id=$2`,
            [`Transcription failed after 5 attempts: ${e?.message}`, j.test_run_id]
          );
        }
      }
    }

    // Check if suite is complete
    await c.query(`
      UPDATE ai_suite_runs s
      SET status = 'completed', completed_at = NOW()
      WHERE s.id IN (
        SELECT DISTINCT suite_run_id FROM ai_transcription_jobs
      )
      AND NOT EXISTS (
        SELECT 1 FROM ai_transcription_jobs j
        WHERE j.suite_run_id = s.id
        AND j.status IN ('queued', 'processing')
      )
      AND EXISTS (
        SELECT 1 FROM ai_transcription_jobs j
        WHERE j.suite_run_id = s.id
      )
      AND s.status = 'running'
    `);

    return { picked: jobs.length, done, failed };
  });

  console.log(`[process-transcriptions] Results:`, out);
  return NextResponse.json({ ok: true, ...out });
}