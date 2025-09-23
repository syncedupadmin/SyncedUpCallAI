// DIRECT TEST - BYPASS ALL THE BULLSHIT AND TEST ONE FILE
const API_URL = 'https://synced-up-call-ai.vercel.app';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';

async function directTest() {
  console.log('=== DIRECT TEST OF ONE MP3 ===\n');

  // Pick one MP3 file
  const testFile = '103833_1253813_9189820488_10438787_4123_1758575563_3706-in-1758575563.mp3';
  const audioUrl = `${API_URL}/test-audio/${testFile}`;

  console.log(`Testing with: ${testFile}`);
  console.log(`Audio URL: ${audioUrl}`);

  // Step 1: Check if file is accessible
  console.log('\nChecking if file is accessible...');
  try {
    const res = await fetch(audioUrl, { method: 'HEAD' });
    if (res.ok) {
      console.log('✅ File is accessible');
    } else {
      console.log('❌ File not accessible:', res.status);
      return;
    }
  } catch (error) {
    console.log('❌ Error accessing file:', error.message);
    return;
  }

  // Step 2: Create a test case for this file
  console.log('\nCreating test case...');
  try {
    const res = await fetch(`${API_URL}/api/testing/bulk-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
        audio_urls: [audioUrl]
      })
    });

    const data = await res.json();
    if (data.success) {
      console.log('✅ Test case created');
      console.log(`  Test case ID: ${data.test_case_ids?.[0] || 'unknown'}`);
    } else {
      console.log('❌ Failed to create test case:', data.error);
      return;
    }
  } catch (error) {
    console.log('❌ Error creating test case:', error.message);
    return;
  }

  // Step 3: Run the test
  console.log('\nRunning test...');
  try {
    // First clear any stuck runs
    await fetch(`${API_URL}/api/testing/clear-stuck`, {
      method: 'POST',
      headers: { 'x-admin-secret': ADMIN_SECRET }
    });

    const res = await fetch(`${API_URL}/api/testing/run/876b6b65-ddaa-42fe-aecd-80457cb66035`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        parallel: 1,
        stopOnFailure: true,
        limit: 1
      })
    });

    const data = await res.json();
    if (res.status === 409) {
      console.log('❌ 409 Conflict - Test already running');
    } else if (data.success) {
      console.log('✅ Test started!');
      console.log(`  Run ID: ${data.suite_run_id}`);

      // Wait and check status
      console.log('\nWaiting 10 seconds then checking status...');
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Check metrics
      const metricsRes = await fetch(`${API_URL}/api/testing/metrics?days=1`, {
        headers: { 'x-admin-secret': ADMIN_SECRET }
      });
      const metrics = await metricsRes.json();

      console.log('\n=== TEST RESULTS ===');
      if (metrics.metrics?.overall) {
        const o = metrics.metrics.overall;
        console.log(`Total tests: ${o.total_tests}`);
        console.log(`Successful: ${o.successful_tests}`);
        console.log(`Failed: ${o.failed_tests}`);
      }
    } else {
      console.log('❌ Failed to start test:', data.error || data.message);
    }
  } catch (error) {
    console.log('❌ Error running test:', error.message);
  }
}

console.log('DIRECT TEST UTILITY');
console.log('='.repeat(50));
directTest().catch(console.error);