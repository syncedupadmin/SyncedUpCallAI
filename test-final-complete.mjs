// Final complete test after fixing all issues
const API_URL = 'https://synced-up-call-ai.vercel.app';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function finalCompleteTest() {
  console.log('=== FINAL COMPLETE TEST - IMPORT AND RUN ===\n');

  // Step 1: Import fresh calls
  console.log('Step 1: Importing fresh calls from Convoso (last 30 days, up to 20 calls)...');
  try {
    const importRes = await fetch(`${API_URL}/api/testing/import-convoso-calls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        suite_id: SUITE_ID,
        days_back: 30,  // Look back 30 days for more calls
        limit: 20        // Import up to 20 calls
      })
    });

    const importResult = await importRes.json();
    console.log('Import status:', importRes.status);

    if (importResult.success) {
      console.log(`✅ Imported ${importResult.imported} calls successfully`);
      console.log(`Failed: ${importResult.failed}`);

      if (importResult.details?.imported?.length > 0) {
        console.log('\nFirst 5 imported calls:');
        importResult.details.imported.slice(0, 5).forEach((call, i) => {
          console.log(`  ${i + 1}. Agent: ${call.agent}, Duration: ${call.duration}s`);
        });
      }
    } else {
      console.error('❌ Import failed:', importResult.error);
      return;
    }
  } catch (error) {
    console.error('Import error:', error);
    return;
  }

  // Step 2: Wait a moment for transcriptions to start
  console.log('\nStep 2: Waiting for transcriptions to process...');
  await sleep(10000); // Wait 10 seconds

  // Check transcription status
  try {
    const monitorRes = await fetch(`${API_URL}/api/testing/monitor`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const monitorData = await monitorRes.json();

    const queue = monitorData.metrics?.transcription_queue;
    if (queue) {
      console.log(`Transcription Queue: Pending=${queue.pending}, Processing=${queue.processing}, Completed=${queue.completed}, Failed=${queue.failed}`);
    }
  } catch (error) {
    console.error('Monitor error:', error);
  }

  // Step 3: Wait for any existing runs to complete
  console.log('\nStep 3: Waiting for any existing test runs to complete...');
  await sleep(5000);

  // Step 4: Try to run tests
  console.log('\nStep 4: Running test suite...');
  let suiteRunId;
  let runAttempts = 0;
  const maxRunAttempts = 3;

  while (runAttempts < maxRunAttempts && !suiteRunId) {
    try {
      const runRes = await fetch(`${API_URL}/api/testing/run/${SUITE_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': ADMIN_SECRET
        },
        body: JSON.stringify({
          parallel: 2,  // Run 2 tests at a time
          stopOnFailure: false
        })
      });

      const runData = await runRes.json();

      if (runRes.status === 409) {
        console.log('⚠️  Test already running, waiting 10 seconds...');
        await sleep(10000);
        runAttempts++;
      } else if (runData.success) {
        suiteRunId = runData.suite_run_id;
        console.log(`✅ Test suite started! Run ID: ${suiteRunId}`);
        console.log(`Running ${runData.total_tests} tests...`);
        break;
      } else {
        console.error('❌ Failed to start tests:', runData.error);
        break;
      }
    } catch (error) {
      console.error('Run error:', error);
      break;
    }
  }

  // Step 5: Wait for tests to complete and check results
  if (suiteRunId) {
    console.log('\nStep 5: Waiting for tests to complete...');
    await sleep(20000); // Wait 20 seconds for tests to run
  }

  // Step 6: Check final metrics
  console.log('\nStep 6: Checking final results...');
  try {
    const metricsRes = await fetch(`${API_URL}/api/testing/metrics?days=1`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const metricsData = await metricsRes.json();

    console.log('\n=== FINAL RESULTS ===');
    const overall = metricsData.metrics?.overall;
    if (overall) {
      console.log(`Total tests run today: ${overall.total_tests}`);
      console.log(`Successful: ${overall.successful_tests}`);
      console.log(`Failed: ${overall.failed_tests}`);

      if (overall.avg_wer) {
        console.log(`Average WER: ${(overall.avg_wer * 100).toFixed(1)}%`);
      }

      if (overall.successful_tests > 0) {
        console.log('\n✅ SUCCESS! Tests are running properly!');
      } else if (overall.failed_tests > 0) {
        console.log('\n⚠️  Tests are running but failing. Check error logs.');
      } else {
        console.log('\n⚠️  No tests completed yet. May still be processing.');
      }
    }

    // Show recent test runs
    if (metricsData.metrics?.recent_runs?.length > 0) {
      console.log('\nRecent test runs:');
      metricsData.metrics.recent_runs.slice(0, 5).forEach(run => {
        const status = run.status === 'completed' ? '✅' : '❌';
        const wer = run.transcript_wer ? `WER: ${(run.transcript_wer * 100).toFixed(1)}%` : '';
        console.log(`  ${status} ${run.test_case_name} - ${run.status} ${wer}`);
        if (run.error_message) {
          console.log(`     Error: ${run.error_message}`);
        }
      });
    }
  } catch (error) {
    console.error('Metrics error:', error);
  }

  // Step 7: Final system health check
  console.log('\nStep 7: Final system health check...');
  try {
    const healthRes = await fetch(`${API_URL}/api/testing/monitor`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const healthData = await healthRes.json();

    console.log(`\nSystem Health Score: ${healthData.health_score}/100`);
    console.log(`Status: ${healthData.status}`);

    if (healthData.health_score >= 80) {
      console.log('✅ System is healthy!');
    } else {
      console.log('⚠️  System health is degraded');
      if (healthData.issues?.length > 0) {
        console.log('Issues:', healthData.issues.join(', '));
      }
    }
  } catch (error) {
    console.error('Health check error:', error);
  }

  console.log('\n=== TEST COMPLETE ===');
  console.log('\nNext steps:');
  console.log('1. Check the dashboard at https://synced-up-call-ai.vercel.app/testing/dashboard');
  console.log('2. Monitor transcription queue status');
  console.log('3. Review test results and WER scores');
}

// Run the final test
finalCompleteTest().catch(console.error);