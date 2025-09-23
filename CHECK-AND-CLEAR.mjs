// CHECK AND CLEAR STUCK TEST RUNS
const API_URL = 'https://synced-up-call-ai.vercel.app';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';

async function checkAndClear() {
  console.log('=== CHECKING TEST RUN STATUS ===\n');

  // Check current status
  const metricsRes = await fetch(`${API_URL}/api/testing/metrics?days=1`, {
    headers: { 'x-admin-secret': ADMIN_SECRET }
  });
  const metrics = await metricsRes.json();

  console.log('Recent Test Activity:');
  if (metrics.metrics?.overall) {
    const o = metrics.metrics.overall;
    console.log(`  Total tests in last 24h: ${o.total_tests}`);
    console.log(`  Successful: ${o.successful_tests}`);
    console.log(`  Failed: ${o.failed_tests}`);
  }

  // Check for running tests
  console.log('\nChecking for running tests...');

  // Try to get suite info
  const suitesRes = await fetch(`${API_URL}/api/testing/suites`, {
    headers: { 'x-admin-secret': ADMIN_SECRET }
  });
  const suites = await suitesRes.json();

  if (suites.suites && suites.suites.length > 0) {
    const suite = suites.suites.find(s => s.id === '876b6b65-ddaa-42fe-aecd-80457cb66035');
    if (suite) {
      console.log(`\nSuite: ${suite.name}`);
      console.log(`  Test cases: ${suite.test_case_count}`);
      console.log(`  Last run: ${suite.last_run_at || 'Never'}`);

      // Check if there's a run in progress
      if (suite.current_run_status === 'running') {
        console.log('  Status: ⚠️ TEST RUNNING');
        console.log('\nA test is currently running. Wait for it to complete or check back later.');
      } else {
        console.log('  Status: ✅ READY TO RUN');
        console.log('\nNo test currently running. You can start a new test run.');
      }
    }
  }

  // Try to start a test with just 1 test case to see if it works
  console.log('\n=== ATTEMPTING TO RUN A SINGLE TEST ===');
  try {
    const runRes = await fetch(`${API_URL}/api/testing/run/876b6b65-ddaa-42fe-aecd-80457cb66035`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        parallel: 1,
        stopOnFailure: false,
        limit: 1  // Just run 1 test
      })
    });

    const runData = await runRes.json();

    if (runRes.status === 409) {
      console.log('❌ Test suite is busy (409 Conflict)');
      console.log('   Another test is already running. Please wait for it to complete.');
      console.log('   This usually takes a few minutes.');
    } else if (runData.success) {
      console.log('✅ Test started successfully!');
      console.log(`   Run ID: ${runData.suite_run_id}`);
      console.log(`   Running ${runData.total_tests} test(s)`);
      console.log('   Check dashboard for progress...');
    } else {
      console.log('❌ Could not start test:', runData.error || runData.message);
    }
  } catch (error) {
    console.error('Error starting test:', error.message);
  }

  console.log('\n📊 Dashboard: https://synced-up-call-ai.vercel.app/testing/dashboard');
  console.log('\nIf tests are stuck, you may need to:');
  console.log('1. Wait a few minutes for current tests to complete');
  console.log('2. Check the database for stuck "running" status in ai_suite_runs table');
  console.log('3. Manually update the status if needed');
}

checkAndClear().catch(console.error);