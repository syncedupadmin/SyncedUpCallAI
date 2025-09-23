// CHECK DATABASE DIRECTLY
import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres'
});

async function checkDatabase() {
  try {
    await client.connect();
    console.log('Connected to database\n');

    // Check for running suite runs
    const suiteRuns = await client.query(`
      SELECT id, suite_id, status, started_at, completed_at
      FROM ai_suite_runs
      ORDER BY started_at DESC
      LIMIT 10
    `);
    console.log('=== SUITE RUNS ===');
    console.log(`Found ${suiteRuns.rows.length} suite runs`);
    suiteRuns.rows.forEach(run => {
      console.log(`  ${run.id.substring(0, 8)}... - Status: ${run.status} - Started: ${run.started_at}`);
    });

    // Check for test runs
    const testRuns = await client.query(`
      SELECT id, test_case_id, status, error_message, created_at
      FROM ai_test_runs
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log('\n=== TEST RUNS ===');
    console.log(`Found ${testRuns.rows.length} test runs`);
    testRuns.rows.forEach(run => {
      console.log(`  ${run.id.substring(0, 8)}... - Status: ${run.status} - Error: ${run.error_message || 'none'}`);
    });

    // Check test cases count
    const testCases = await client.query(`
      SELECT COUNT(*) as count
      FROM ai_test_cases
      WHERE suite_id = '876b6b65-ddaa-42fe-aecd-80457cb66035'
    `);
    console.log('\n=== TEST CASES ===');
    console.log(`Total test cases: ${testCases.rows[0].count}`);

    // Check calls table columns
    const columns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'calls'
      AND column_name IN ('source', 'agent_name', 'created_at', 'analyzed_at', 'is_test')
    `);
    console.log('\n=== CALLS TABLE COLUMNS ===');
    console.log(`Found columns: ${columns.rows.map(r => r.column_name).join(', ')}`);

    // Check for test calls
    const testCalls = await client.query(`
      SELECT COUNT(*) as count
      FROM calls
      WHERE is_test = true
    `);
    console.log(`Test calls in database: ${testCalls.rows[0].count}`);

    // Check transcription queue
    const queue = await client.query(`
      SELECT status, COUNT(*) as count
      FROM transcription_queue
      GROUP BY status
    `);
    console.log('\n=== TRANSCRIPTION QUEUE ===');
    queue.rows.forEach(row => {
      console.log(`  ${row.status}: ${row.count}`);
    });

  } catch (error) {
    console.error('Database error:', error);
  } finally {
    await client.end();
  }
}

console.log('DIRECT DATABASE CHECK');
console.log('='.repeat(50));
checkDatabase().catch(console.error);