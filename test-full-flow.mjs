// Full test of the Convoso import and testing flow
const API_URL = 'https://synced-up-call-ai.vercel.app';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testFullFlow() {
  console.log('=== TESTING FULL CONVOSO IMPORT AND TEST FLOW ===\n');

  // Step 1: Check Convoso connection
  console.log('Step 1: Checking Convoso connection...');
  try {
    const checkRes = await fetch(`${API_URL}/api/testing/import-convoso-calls`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const checkData = await checkRes.json();
    console.log('Connection status:', checkData.connected ? '✅ Connected' : '❌ Not connected');
    if (!checkData.connected) {
      console.error('Convoso not connected:', checkData.message);
      return;
    }
  } catch (error) {
    console.error('Failed to check connection:', error);
    return;
  }

  // Step 2: Import 20 calls from Convoso
  console.log('\nStep 2: Importing 20 calls from Convoso...');
  let importResult;
  try {
    const importRes = await fetch(`${API_URL}/api/testing/import-convoso-calls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        suite_id: SUITE_ID,
        days_back: 7,  // Look back 7 days for more calls
        limit: 20       // Import 20 calls
      })
    });

    importResult = await importRes.json();
    console.log('Import status:', importRes.status);
    console.log('Import response:', JSON.stringify(importResult, null, 2));

    if (!importResult.success) {
      console.error('Import failed:', importResult.error);
      return;
    }

    console.log(`✅ Successfully imported ${importResult.imported} calls`);
    if (importResult.failed > 0) {
      console.log(`⚠️  Failed to import ${importResult.failed} calls`);
    }

    if (importResult.details?.imported) {
      console.log('\nImported calls:');
      importResult.details.imported.forEach((call, i) => {
        console.log(`  ${i + 1}. Call ID: ${call.call_id}, Test Case: ${call.test_case_id}, Agent: ${call.agent}, Duration: ${call.duration}s`);
      });
    }

    if (importResult.details?.failed?.length > 0) {
      console.log('\nFailed imports:');
      importResult.details.failed.forEach(fail => {
        console.log(`  - ${fail.convoso_id}: ${fail.error}`);
      });
    }
  } catch (error) {
    console.error('Import error:', error);
    return;
  }

  // Step 3: Check transcription queue status
  console.log('\nStep 3: Monitoring transcription queue...');
  let transcriptionComplete = false;
  let attempts = 0;
  const maxAttempts = 60; // Wait up to 5 minutes

  while (!transcriptionComplete && attempts < maxAttempts) {
    try {
      const monitorRes = await fetch(`${API_URL}/api/testing/monitor`, {
        headers: {
          'x-admin-secret': ADMIN_SECRET
        }
      });
      const monitorData = await monitorRes.json();

      const queue = monitorData.metrics?.transcription_queue;
      if (queue) {
        console.log(`  Pending: ${queue.pending}, Processing: ${queue.processing}, Completed: ${queue.completed}, Failed: ${queue.failed}`);

        // Check if all are processed (none pending or processing)
        if (queue.pending === 0 && queue.processing === 0) {
          transcriptionComplete = true;
          console.log('✅ All transcriptions complete!');
        }
      }

      if (!transcriptionComplete) {
        await sleep(5000); // Wait 5 seconds before checking again
        attempts++;
      }
    } catch (error) {
      console.error('Monitor error:', error);
      break;
    }
  }

  if (!transcriptionComplete) {
    console.log('⚠️  Transcriptions still in progress after 5 minutes');
  }

  // Step 4: Get test suite details
  console.log('\nStep 4: Getting test suite details...');
  try {
    const suitesRes = await fetch(`${API_URL}/api/testing/suites`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const suitesData = await suitesRes.json();

    const suite = suitesData.suites?.find(s => s.id === SUITE_ID);
    if (suite) {
      console.log(`Suite: ${suite.name}`);
      console.log(`Total test cases: ${suite.test_case_count}`);
      console.log(`Active test cases: ${suite.active_test_cases}`);
    }
  } catch (error) {
    console.error('Failed to get suite details:', error);
  }

  // Step 5: Run the test suite
  console.log('\nStep 5: Running test suite...');
  let suiteRunId;
  try {
    const runRes = await fetch(`${API_URL}/api/testing/run/${SUITE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        parallel: 3,        // Run 3 tests at a time
        stopOnFailure: false
      })
    });

    const runData = await runRes.json();
    console.log('Run status:', runRes.status);

    if (runRes.status === 409) {
      console.log('⚠️  Suite already running or recently run');
      console.log('Response:', runData);
    } else if (runData.success) {
      suiteRunId = runData.suite_run_id;
      console.log(`✅ Test suite started! Run ID: ${suiteRunId}`);
      console.log(`Running ${runData.total_tests} tests...`);
    } else {
      console.error('Failed to start test suite:', runData.error);
    }
  } catch (error) {
    console.error('Run error:', error);
  }

  // Step 6: Monitor test execution (if suite was started)
  if (suiteRunId) {
    console.log('\nStep 6: Monitoring test execution...');
    // Note: Would normally use SSE here, but for simplicity we'll poll metrics

    await sleep(10000); // Wait 10 seconds for tests to run

    try {
      const metricsRes = await fetch(`${API_URL}/api/testing/metrics?days=1`, {
        headers: {
          'x-admin-secret': ADMIN_SECRET
        }
      });
      const metricsData = await metricsRes.json();

      console.log('\n=== TEST RESULTS ===');
      const overall = metricsData.metrics?.overall;
      if (overall) {
        console.log(`Total tests run: ${overall.total_tests}`);
        console.log(`Successful: ${overall.successful_tests}`);
        console.log(`Failed: ${overall.failed_tests}`);
        console.log(`Average WER: ${overall.avg_wer ? (overall.avg_wer * 100).toFixed(1) + '%' : 'N/A'}`);
        console.log(`Average execution time: ${overall.avg_execution_time_ms ? (overall.avg_execution_time_ms / 1000).toFixed(1) + 's' : 'N/A'}`);
      }
    } catch (error) {
      console.error('Failed to get metrics:', error);
    }
  }

  // Step 7: Check for any system issues
  console.log('\nStep 7: Checking system health...');
  try {
    const healthRes = await fetch(`${API_URL}/api/testing/monitor`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const healthData = await healthRes.json();

    console.log(`System health score: ${healthData.health_score}/100`);
    console.log(`Status: ${healthData.status}`);

    if (healthData.issues?.length > 0) {
      console.log('\nIssues detected:');
      healthData.issues.forEach(issue => {
        console.log(`  - ${issue}`);
      });
    }

    if (healthData.recommendations?.length > 0) {
      console.log('\nRecommendations:');
      healthData.recommendations.forEach(rec => {
        console.log(`  - ${rec}`);
      });
    }
  } catch (error) {
    console.error('Failed to check health:', error);
  }

  console.log('\n=== TEST COMPLETE ===');
}

// Run the test
testFullFlow().catch(console.error);