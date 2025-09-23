import { Client } from "pg";

const DB = process.env.DATABASE_URL;
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';

const client = new Client({ connectionString: DB });
await client.connect();

console.log('=== SANITY CHECK REPORT ===\n');

try {
  // 1. Check suite runs
  console.log('1) SUITE RUNS:');
  const suiteRuns = await client.query(`
    SELECT id, status, started_at, completed_at
    FROM ai_suite_runs
    WHERE suite_id = $1
    ORDER BY started_at DESC
    LIMIT 3
  `, [SUITE_ID]);

  if (suiteRuns.rows.length === 0) {
    console.log('   ❌ No suite runs found');
  } else {
    suiteRuns.rows.forEach(run => {
      console.log(`   ${run.status === 'running' ? '🔄' : run.status === 'completed' ? '✅' : '❌'} ${run.id}`);
      console.log(`      Status: ${run.status}`);
      console.log(`      Started: ${run.started_at}`);
      console.log(`      Completed: ${run.completed_at || 'Still running'}`);
    });
  }

  const latestRun = suiteRuns.rows[0];
  if (!latestRun) {
    console.log('\n   No runs to analyze');
    await client.end();
    process.exit(0);
  }

  const suiteRunId = latestRun.id;

  // 2. Check test runs for this suite
  console.log(`\n2) TEST RUNS FOR SUITE ${suiteRunId}:`);
  const testRunStats = await client.query(`
    SELECT status, COUNT(*) as count
    FROM ai_test_runs
    WHERE suite_run_id = $1
    GROUP BY status
  `, [suiteRunId]);

  if (testRunStats.rows.length === 0) {
    console.log('   ❌ No test runs found - bulk tester may not be running');
  } else {
    testRunStats.rows.forEach(stat => {
      const emoji = stat.status === 'completed' ? '✅' :
                    stat.status === 'running' ? '🔄' :
                    stat.status === 'failed' ? '❌' : '❓';
      console.log(`   ${emoji} ${stat.status}: ${stat.count}`);
    });
  }

  // 3. Check transcripts
  console.log('\n3) TRANSCRIPTS STATUS:');
  const transcriptStatus = await client.query(`
    SELECT
      r.id as test_run_id,
      r.status,
      t.engine as provider,
      LENGTH(t.text) as len,
      t.created_at
    FROM ai_test_runs r
    LEFT JOIN transcripts t ON t.call_id = r.call_id
    WHERE r.suite_run_id = $1
    ORDER BY t.created_at DESC NULLS LAST
    LIMIT 10
  `, [suiteRunId]);

  let withTranscript = 0;
  let withoutTranscript = 0;

  transcriptStatus.rows.forEach(row => {
    if (row.provider && row.len > 0) {
      withTranscript++;
      console.log(`   ✅ Test ${row.test_run_id.substring(0, 8)}: ${row.provider}, ${row.len} chars`);
    } else {
      withoutTranscript++;
      console.log(`   ⏳ Test ${row.test_run_id.substring(0, 8)}: No transcript yet`);
    }
  });

  console.log(`   Summary: ${withTranscript} with transcripts, ${withoutTranscript} without`);

  // 4. Check ground truth
  console.log('\n4) GROUND TRUTH CHECK:');
  const groundTruth = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE expected_transcript IS NOT NULL AND expected_transcript != '') as with_gt,
      COUNT(*) as total
    FROM ai_test_cases
    WHERE suite_id = $1
  `, [SUITE_ID]);

  const gt = groundTruth.rows[0];
  if (gt.with_gt > 0) {
    console.log(`   ✅ ${gt.with_gt}/${gt.total} test cases have ground truth`);
  } else {
    console.log(`   ⚠️  No ground truth found (0/${gt.total} test cases)`);
    console.log(`      Dashboard will show "No ground truth" for WER`);
  }

  // 5. Calculate WER if possible
  console.log('\n5) WER CALCULATION:');
  const werCalc = await client.query(`
    SELECT ROUND(AVG(transcript_wer)::numeric, 4) as avg_wer
    FROM ai_test_runs r
    JOIN ai_test_cases c ON c.id = r.test_case_id
    WHERE r.status = 'completed'
    AND c.expected_transcript IS NOT NULL
    AND c.expected_transcript != ''
  `);

  if (werCalc.rows[0].avg_wer !== null) {
    console.log(`   ✅ Average WER: ${werCalc.rows[0].avg_wer} (${(werCalc.rows[0].avg_wer * 100).toFixed(2)}%)`);
  } else {
    console.log(`   ⚠️  Cannot calculate WER (no completed tests with ground truth)`);
  }

  // 6. Check for stuck runs
  console.log('\n6) STUCK RUNS CHECK:');
  const stuckRuns = await client.query(`
    SELECT COUNT(*) as stuck_count
    FROM ai_suite_runs
    WHERE status = 'running'
    AND started_at < NOW() - INTERVAL '30 minutes'
  `);

  if (stuckRuns.rows[0].stuck_count > 0) {
    console.log(`   ⚠️  ${stuckRuns.rows[0].stuck_count} runs stuck for >30 minutes`);
    console.log(`      Consider running clear-stuck endpoint`);
  } else {
    console.log(`   ✅ No stuck runs`);
  }

} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  await client.end();
}