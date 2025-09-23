// RUN ALL TESTS ON UPLOADED MP3 FILES
const API_URL = 'https://synced-up-call-ai.vercel.app';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';

// Clear stuck runs first
async function clearStuckRuns() {
  console.log('Clearing any stuck test runs...');
  try {
    const res = await fetch(`${API_URL}/api/testing/clear-stuck`, {
      method: 'POST',
      headers: { 'x-admin-secret': ADMIN_SECRET }
    });
    const data = await res.json();
    if (data.success) {
      console.log(`  ✅ Cleared ${data.cleared.suite_runs} stuck suite runs`);
      console.log(`  ✅ Cleared ${data.cleared.test_runs} stuck test runs`);
      return true;
    }
    return false;
  } catch (error) {
    console.log('  ⚠️ Could not clear stuck runs:', error.message);
    return false;
  }
}

// Get suite information
async function getSuiteInfo() {
  try {
    const res = await fetch(`${API_URL}/api/testing/suites`, {
      headers: { 'x-admin-secret': ADMIN_SECRET }
    });
    const data = await res.json();
    const suite = data.suites?.find(s => s.id === SUITE_ID);
    return suite;
  } catch (error) {
    console.log('  ❌ Could not get suite info:', error.message);
    return null;
  }
}

// Monitor test run progress
async function monitorTestRun(runId) {
  console.log('\nMonitoring test run progress...');
  console.log('Press Ctrl+C to stop monitoring (tests will continue running)\n');

  let lastUpdate = null;
  let consecutiveErrors = 0;

  while (true) {
    try {
      // Get current metrics
      const metricsRes = await fetch(`${API_URL}/api/testing/metrics?days=1`, {
        headers: { 'x-admin-secret': ADMIN_SECRET }
      });
      const metrics = await metricsRes.json();

      // Get suite status
      const suite = await getSuiteInfo();

      // Display update
      const timestamp = new Date().toLocaleTimeString();
      const status = suite?.current_run_status || 'unknown';

      console.clear(); // Clear console for clean display
      console.log('=' .repeat(60));
      console.log(`TEST RUN MONITOR - ${timestamp}`);
      console.log('=' .repeat(60));

      if (suite) {
        console.log(`\nSuite: ${suite.name}`);
        console.log(`Status: ${status.toUpperCase()}`);
        console.log(`Total test cases: ${suite.test_case_count}`);
      }

      if (metrics.metrics?.overall) {
        const o = metrics.metrics.overall;
        console.log('\nToday\'s Results:');
        console.log(`  Total tests run: ${o.total_tests}`);
        console.log(`  Successful: ${o.successful_tests} ✅`);
        console.log(`  Failed: ${o.failed_tests} ❌`);
        if (o.avg_wer !== null && o.avg_wer !== undefined) {
          console.log(`  Average WER: ${(o.avg_wer * 100).toFixed(1)}%`);
        }
      }

      // Check if run is complete
      if (status !== 'running' && lastUpdate === status) {
        console.log('\n✅ Test run complete!');
        console.log('View full results at:');
        console.log(`${API_URL}/testing/dashboard`);
        break;
      }

      lastUpdate = status;
      consecutiveErrors = 0;

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
      consecutiveErrors++;
      console.log(`\n⚠️ Error checking status: ${error.message}`);

      if (consecutiveErrors > 5) {
        console.log('❌ Too many consecutive errors. Stopping monitor.');
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

async function RUN_ALL_TESTS() {
  console.log('=' .repeat(60));
  console.log('AI TESTING - RUN ALL TESTS');
  console.log('=' .repeat(60));

  // Step 1: Clear stuck runs
  await clearStuckRuns();

  // Step 2: Get suite information
  console.log('\nChecking suite status...');
  const suite = await getSuiteInfo();

  if (!suite) {
    console.log('❌ Could not find test suite');
    return;
  }

  console.log(`\nSuite: ${suite.name}`);
  console.log(`Test cases available: ${suite.test_case_count}`);
  console.log(`Last run: ${suite.last_run_at || 'Never'}`);
  console.log(`Current status: ${suite.current_run_status || 'idle'}`);

  if (suite.current_run_status === 'running') {
    console.log('\n⚠️ Tests are already running!');
    console.log('Do you want to:');
    console.log('1. Monitor the current run');
    console.log('2. Clear stuck runs and start fresh');
    console.log('\nWaiting 5 seconds to monitor current run...');

    setTimeout(() => {
      monitorTestRun(null);
    }, 5000);
    return;
  }

  if (suite.test_case_count === 0) {
    console.log('\n❌ No test cases found!');
    console.log('Please run PROCESS-ALL-1249.mjs first to upload MP3 files');
    return;
  }

  // Step 3: Configure test run
  const config = {
    parallel: 10,       // Run 10 tests simultaneously
    stopOnFailure: false,
    limit: null        // Run all tests (set a number to limit)
  };

  console.log('\n' + '='.repeat(60));
  console.log('TEST CONFIGURATION');
  console.log('='.repeat(60));
  console.log(`Parallel execution: ${config.parallel} tests at once`);
  console.log(`Stop on failure: ${config.stopOnFailure}`);
  console.log(`Test limit: ${config.limit || 'All tests'}`);

  // Step 4: Start test run
  console.log('\n' + '='.repeat(60));
  console.log('STARTING TEST RUN...');
  console.log('='.repeat(60));

  try {
    const runRes = await fetch(`${API_URL}/api/testing/run/${SUITE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify(config)
    });

    const runData = await runRes.json();

    if (runRes.status === 409) {
      console.log('\n⚠️ Test suite is busy (409 Conflict)');
      console.log('Attempting to clear stuck runs...');

      const cleared = await clearStuckRuns();
      if (cleared) {
        console.log('Retrying test run...');

        // Retry after clearing
        const retryRes = await fetch(`${API_URL}/api/testing/run/${SUITE_ID}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': ADMIN_SECRET
          },
          body: JSON.stringify(config)
        });

        const retryData = await retryRes.json();
        if (retryData.success) {
          console.log('\n✅ Test run started successfully!');
          console.log(`Run ID: ${retryData.suite_run_id}`);
          console.log(`Running ${retryData.total_tests} tests`);

          // Monitor progress
          await monitorTestRun(retryData.suite_run_id);
        } else {
          console.log('❌ Still could not start tests:', retryData.error);
        }
      }
    } else if (runData.success) {
      console.log('\n✅ Test run started successfully!');
      console.log(`Run ID: ${runData.suite_run_id}`);
      console.log(`Running ${runData.total_tests} tests`);

      // Monitor progress
      await monitorTestRun(runData.suite_run_id);
    } else {
      console.log('❌ Failed to start test run:', runData.error || runData.message);
    }

  } catch (error) {
    console.error('❌ Error starting test run:', error);
  }
}

// Main execution
console.log('This script will run all uploaded test cases');
console.log('Starting in 3 seconds... (Press Ctrl+C to cancel)\n');

setTimeout(() => {
  RUN_ALL_TESTS().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}, 3000);