import { NextResponse } from "next/server";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minute max

export async function GET(req: Request) {
  // Simple auth check for cron
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('[queue-bulk-tests] Unauthorized cron attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const c = new Client({ connectionString: process.env.DATABASE_URL! });
  await c.connect();

  try {
    // Find newest running suite
    const suite = await c.query(
      `SELECT id, suite_id FROM ai_suite_runs WHERE status='running' ORDER BY started_at DESC LIMIT 1`
    );

    if (!suite.rows.length) {
      await c.end();
      console.log('[queue-bulk-tests] No running suite found');
      return NextResponse.json({ ok: true, info: "no running suite" });
    }

    const suite_run_id = suite.rows[0].id;
    const suite_id = suite.rows[0].suite_id;

    console.log(`[queue-bulk-tests] Processing suite run: ${suite_run_id}`);

    // Find test cases that haven't been run yet
    const unrunCases = await c.query(`
      SELECT tc.id as test_case_id, tc.audio_url
      FROM ai_test_cases tc
      LEFT JOIN ai_test_runs tr ON tr.test_case_id = tc.id AND tr.suite_run_id = $1
      WHERE tc.suite_id = $2 AND tr.id IS NULL
      LIMIT 100
    `, [suite_run_id, suite_id]);

    if (unrunCases.rows.length === 0) {
      await c.end();
      console.log('[queue-bulk-tests] All test cases already have runs');
      return NextResponse.json({ ok: true, enqueued: 0, info: "all cases already running" });
    }

    console.log(`[queue-bulk-tests] Found ${unrunCases.rows.length} unrun test cases`);

    // Create calls and test runs for each unrun case
    let created = 0;
    for (const testCase of unrunCases.rows) {
      try {
        // Create call
        const callResult = await c.query(`
          INSERT INTO calls (
            recording_url, duration_sec, office_id, agent_name,
            source, is_test, analyzed_at, created_at
          )
          VALUES ($1, 30, 1, 'TEST_AGENT', 'ai_test', true, NOW(), NOW())
          RETURNING id
        `, [testCase.audio_url]);

        const call_id = callResult.rows[0].id;

        // Create test run
        const testRunResult = await c.query(`
          INSERT INTO ai_test_runs (test_case_id, suite_run_id, call_id, status)
          VALUES ($1, $2, $3, 'running')
          RETURNING id
        `, [testCase.test_case_id, suite_run_id, call_id]);

        const test_run_id = testRunResult.rows[0].id;

        // Create job for processing
        await c.query(`
          INSERT INTO ai_transcription_jobs (
            suite_run_id, test_run_id, call_id, audio_url, status
          )
          VALUES ($1, $2, $3, $4, 'queued')
        `, [suite_run_id, test_run_id, call_id, testCase.audio_url]);

        created++;
      } catch (e: any) {
        console.error(`[queue-bulk-tests] Failed to create test run for ${testCase.test_case_id}:`, e.message);
      }
    }

    await c.end();

    console.log(`[queue-bulk-tests] Enqueued ${created} new test runs`);
    return NextResponse.json({
      ok: true,
      enqueued: created,
      suite_run_id,
      total_unrun: unrunCases.rows.length
    });

  } catch (error: any) {
    console.error('[queue-bulk-tests] Error:', error);
    await c.end();
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}