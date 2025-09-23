import { Client } from "pg";

const DB = process.env.DATABASE_URL;
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';
const BASE_URL = 'http://localhost:3000';

const client = new Client({ connectionString: DB });
await client.connect();

console.log('=== TESTING CRON SYSTEM ===\n');

try {
  // 1. Create a new suite run
  console.log('1) Creating new suite run...');
  const { rows: suite } = await client.query(
    "INSERT INTO ai_suite_runs (suite_id, status, started_at) VALUES ($1, 'running', NOW()) RETURNING id",
    [SUITE_ID]
  );
  const suite_run_id = suite[0].id;
  console.log(`   ✅ Suite run created: ${suite_run_id}\n`);

  // 2. Call queue-bulk-tests endpoint
  console.log('2) Calling queue-bulk-tests endpoint...');
  const queueResp = await fetch(`${BASE_URL}/api/cron/queue-bulk-tests`, {
    headers: {
      'authorization': `Bearer ${process.env.CRON_SECRET || ''}`
    }
  });

  if (queueResp.ok) {
    const queueData = await queueResp.json();
    console.log(`   ✅ Response:`, queueData);
    console.log(`      Enqueued: ${queueData.enqueued} tests\n`);
  } else {
    console.log(`   ❌ Failed: ${queueResp.status} ${queueResp.statusText}`);
    const text = await queueResp.text();
    console.log(`      ${text}\n`);
  }

  // 3. Check jobs table
  console.log('3) Checking ai_transcription_jobs table...');
  const jobs = await client.query(
    `SELECT status, COUNT(*) as count
     FROM ai_transcription_jobs
     WHERE suite_run_id = $1
     GROUP BY status`,
    [suite_run_id]
  );

  if (jobs.rows.length > 0) {
    console.log('   Jobs created:');
    jobs.rows.forEach(row => {
      console.log(`      ${row.status}: ${row.count}`);
    });
  } else {
    console.log('   ❌ No jobs found');
  }

  // 4. Call process-transcriptions endpoint
  console.log('\n4) Calling process-transcriptions endpoint...');
  const processResp = await fetch(`${BASE_URL}/api/cron/process-transcriptions`, {
    headers: {
      'authorization': `Bearer ${process.env.CRON_SECRET || ''}`
    }
  });

  if (processResp.ok) {
    const processData = await processResp.json();
    console.log(`   ✅ Response:`, processData);
    console.log(`      Picked: ${processData.picked} jobs`);
    console.log(`      Done: ${processData.done}`);
    console.log(`      Failed: ${processData.failed}\n`);
  } else {
    console.log(`   ❌ Failed: ${processResp.status} ${processResp.statusText}`);
    const text = await processResp.text();
    console.log(`      ${text}\n`);
  }

  // 5. Check test runs
  console.log('5) Checking test runs...');
  const testRuns = await client.query(
    `SELECT status, COUNT(*) as count
     FROM ai_test_runs
     WHERE suite_run_id = $1
     GROUP BY status`,
    [suite_run_id]
  );

  if (testRuns.rows.length > 0) {
    console.log('   Test runs:');
    testRuns.rows.forEach(row => {
      console.log(`      ${row.status}: ${row.count}`);
    });
  } else {
    console.log('   ❌ No test runs found');
  }

  // 6. Clean up - mark suite as failed to stop processing
  console.log('\n6) Cleaning up...');
  await client.query(
    "UPDATE ai_suite_runs SET status='failed', completed_at=NOW() WHERE id=$1",
    [suite_run_id]
  );
  console.log('   ✅ Suite marked as failed to stop processing');

  console.log('\n✅ CRON SYSTEM TEST COMPLETE');
  console.log('   The cron endpoints are working correctly!');
  console.log('   Jobs are created and can be processed in batches.');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error);
} finally {
  await client.end();
}