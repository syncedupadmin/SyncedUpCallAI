// FORCE CLEAR ALL STUCK RUNS AND FIX DATABASE
const API_URL = 'https://synced-up-call-ai.vercel.app';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';

async function forceClearAndFix() {
  console.log('=== FORCE CLEARING ALL STUCK RUNS ===\n');

  // Step 1: Apply database fixes
  console.log('Applying database fixes...');
  try {
    const fixRes = await fetch(`${API_URL}/api/testing/fix-database`, {
      method: 'POST',
      headers: {
        'x-admin-secret': ADMIN_SECRET,
        'Content-Type': 'application/json'
      }
    });

    // Get response text first in case it's HTML
    const responseText = await fixRes.text();

    try {
      const fixData = JSON.parse(responseText);
      if (fixData.success) {
        console.log('✅ Database fixes applied');
        console.log(`  Columns verified: ${fixData.fixes?.columns_verified?.join(', ') || 'none'}`);
        console.log(`  Stuck runs cleared: ${fixData.fixes?.stuck_suite_runs_cleared || 0}`);
      } else {
        console.log('⚠️ Database fix issues:', fixData.error);
      }
    } catch (e) {
      console.log('⚠️ Fix endpoint returned HTML (still building), continuing...');
    }
  } catch (error) {
    console.log('⚠️ Could not apply fixes:', error.message);
  }

  // Step 2: Clear stuck runs multiple times to be sure
  console.log('\nClearing stuck runs (attempt 1)...');
  await clearStuck();

  console.log('Clearing stuck runs (attempt 2)...');
  await clearStuck();

  console.log('Clearing stuck runs (attempt 3)...');
  await clearStuck();

  // Step 3: Check if we can run tests now
  console.log('\n=== ATTEMPTING TEST RUN ===');

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
        limit: 1  // Just test with 1 file
      })
    });

    const runData = await runRes.json();

    if (runRes.status === 409) {
      console.log('\n❌ STILL GETTING 409 CONFLICT');
      console.log('This means there is a stuck run in the database.');
      console.log('\nTrying alternative clear method...');

      // Try to get the stuck run ID directly
      const suites = await fetch(`${API_URL}/api/testing/suites`, {
        headers: { 'x-admin-secret': ADMIN_SECRET }
      });
      const suitesData = await suites.json();
      console.log('Suite status:', suitesData.suites?.[0]?.current_run_status);

    } else if (runData.success) {
      console.log('\n✅ SUCCESS! Test started!');
      console.log(`Run ID: ${runData.suite_run_id}`);
      console.log(`Running ${runData.total_tests} test(s)`);
      console.log('\nView progress at:');
      console.log(`${API_URL}/testing/dashboard`);
    } else {
      console.log('❌ Error:', runData.error || runData.message);
    }
  } catch (error) {
    console.log('❌ Error starting test:', error.message);
  }
}

async function clearStuck() {
  try {
    const res = await fetch(`${API_URL}/api/testing/clear-stuck`, {
      method: 'POST',
      headers: { 'x-admin-secret': ADMIN_SECRET }
    });
    const data = await res.json();
    if (data.cleared) {
      console.log(`  Cleared ${data.cleared.suite_runs} suite runs, ${data.cleared.test_runs} test runs`);
    }
  } catch (error) {
    console.log('  Error clearing:', error.message);
  }
}

console.log('FORCE CLEAR UTILITY');
console.log('='.repeat(50));
console.log('This will:');
console.log('1. Apply database fixes');
console.log('2. Clear stuck runs multiple times');
console.log('3. Attempt to start a test run\n');

forceClearAndFix().catch(console.error);