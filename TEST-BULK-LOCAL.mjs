import { Client } from "pg";
import pLimit from "p-limit";

const DB = process.env.DATABASE_URL;
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';
const JOBS_SECRET = process.env.JOBS_SECRET || 'dffrgvioervov554w8cwswiocvjsd';

async function runTestCase({ test_case_id, suite_run_id }) {
  const client = new Client({ connectionString: DB });
  await client.connect();

  console.log(`  Starting test ${test_case_id.substring(0, 8)}...`);

  try {
    // Get test case
    const { rows: cases } = await client.query(
      "SELECT id, audio_url, COALESCE(audio_duration_sec, 30) as dur FROM ai_test_cases WHERE id=$1",
      [test_case_id]
    );

    if (!cases.length) {
      throw new Error("Test case not found");
    }

    const tc = cases[0];

    // Create test run
    const { rows: trRows } = await client.query(
      "INSERT INTO ai_test_runs (test_case_id, suite_run_id, status) VALUES ($1, $2, 'running') RETURNING id",
      [test_case_id, suite_run_id]
    );

    const test_run_id = trRows[0].id;
    console.log(`    Created test run ${test_run_id.substring(0, 8)}`);

    // Create synthetic call
    const { rows: callRows } = await client.query(
      `INSERT INTO calls (recording_url, duration_sec, office_id, agent_name, source, is_test, analyzed_at, created_at)
       VALUES ($1, $2, 1, 'TEST_AGENT', 'ai_test', true, NOW(), NOW())
       RETURNING id`,
      [tc.audio_url, tc.dur]
    );

    const callId = callRows[0].id;
    console.log(`    Created call ${callId.substring(0, 8)}`);

    // Update test run with call_id
    await client.query(
      "UPDATE ai_test_runs SET call_id=$2 WHERE id=$1",
      [test_run_id, callId]
    );

    // Mark as completed for now (skipping transcription for this test)
    await client.query(
      "UPDATE ai_test_runs SET status='completed' WHERE id=$1",
      [test_run_id]
    );

    console.log(`    ✅ Completed`);

  } catch (e) {
    console.error(`    ❌ Failed:`, e.message);
    throw e;
  } finally {
    await client.end();
  }
}

async function runSuite() {
  const client = new Client({ connectionString: DB });
  await client.connect();

  console.log('Running test suite locally...\n');

  // Create suite run
  const { rows: suite } = await client.query(
    "INSERT INTO ai_suite_runs (suite_id, status, started_at) VALUES ($1, 'running', NOW()) RETURNING id",
    [SUITE_ID]
  );
  const suite_run_id = suite[0].id;
  console.log(`Suite run created: ${suite_run_id}\n`);

  try {
    // Get first 5 test cases
    const { rows: tests } = await client.query(
      "SELECT id FROM ai_test_cases WHERE suite_id=$1 LIMIT 5",
      [SUITE_ID]
    );

    console.log(`Found ${tests.length} test cases to run\n`);

    // Run tests with concurrency limit
    const limitP = pLimit(2);
    await Promise.all(tests.map(t =>
      limitP(() => runTestCase({ test_case_id: t.id, suite_run_id }))
    ));

    // Mark suite as completed
    await client.query(
      "UPDATE ai_suite_runs SET status='completed', completed_at=NOW() WHERE id=$1",
      [suite_run_id]
    );

    console.log(`\n✅ Suite run completed`);

  } catch (e) {
    await client.query(
      "UPDATE ai_suite_runs SET status='failed', completed_at=NOW() WHERE id=$1",
      [suite_run_id]
    );
    console.error(`\n❌ Suite run failed:`, e.message);
  } finally {
    await client.end();
  }
}

// Run it
runSuite().catch(console.error);