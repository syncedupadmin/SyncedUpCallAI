// Test complete flow with local MP3 file
import { readFileSync } from 'fs';

const API_URL = 'https://synced-up-call-ai.vercel.app';
const LOCAL_URL = 'http://localhost:3000';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLocalMP3() {
  console.log('=== TESTING COMPLETE FLOW WITH LOCAL MP3 ===\n');

  // The audio file will be served from the public folder
  const audioUrl = `${LOCAL_URL}/test-audio.mp3`;
  const testName = 'Convoso Call Test - Local MP3';

  // Step 1: Create test case with the local MP3
  console.log('Step 1: Creating test case with local MP3...');
  let testCaseId;
  try {
    const createRes = await fetch(`${LOCAL_URL}/api/testing/bulk-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        suite_id: SUITE_ID,
        audio_urls: [audioUrl]
      })
    });

    const createData = await createRes.json();
    console.log('Create response:', createData);

    if (createData.success && createData.details?.imported?.[0]) {
      testCaseId = createData.details.imported[0].test_case_id;
      console.log(`✅ Test case created: ${testCaseId}`);
    } else {
      console.error('Failed to create test case:', createData.error);
      return;
    }
  } catch (error) {
    console.error('Error creating test case:', error);
    return;
  }

  // Step 2: Wait for transcription
  console.log('\nStep 2: Waiting for transcription to complete...');
  await sleep(5000); // Wait 5 seconds for transcription to start

  let transcriptionComplete = false;
  let attempts = 0;
  while (!transcriptionComplete && attempts < 30) {
    try {
      const monitorRes = await fetch(`${LOCAL_URL}/api/testing/monitor`, {
        headers: {
          'x-admin-secret': ADMIN_SECRET
        }
      });
      const monitorData = await monitorRes.json();

      const queue = monitorData.metrics?.transcription_queue;
      if (queue) {
        console.log(`  Queue: Pending=${queue.pending}, Processing=${queue.processing}, Completed=${queue.completed}`);

        // Check if our specific test is done
        if (queue.pending === 0 && queue.processing === 0) {
          transcriptionComplete = true;
          console.log('✅ Transcription complete!');
        }
      }

      if (!transcriptionComplete) {
        await sleep(3000); // Check every 3 seconds
        attempts++;
      }
    } catch (error) {
      console.error('Monitor error:', error);
      break;
    }
  }

  // Step 3: Run the test
  console.log('\nStep 3: Running test on the audio file...');
  let suiteRunId;
  try {
    const runRes = await fetch(`${LOCAL_URL}/api/testing/run/${SUITE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        parallel: 1,
        stopOnFailure: false,
        test_case_ids: testCaseId ? [testCaseId] : undefined // Run specific test if we have it
      })
    });

    const runData = await runRes.json();
    console.log('Run status:', runRes.status);

    if (runRes.status === 409) {
      console.log('⚠️  Test already running, waiting...');
      await sleep(10000);
    } else if (runData.success) {
      suiteRunId = runData.suite_run_id;
      console.log(`✅ Test started! Run ID: ${suiteRunId}`);
    } else {
      console.error('Failed to start test:', runData.error);
    }
  } catch (error) {
    console.error('Run error:', error);
  }

  // Step 4: Wait for test to complete and get results
  if (suiteRunId) {
    console.log('\nStep 4: Waiting for test to complete...');
    await sleep(15000); // Wait 15 seconds for test to run

    // Get results
    try {
      const metricsRes = await fetch(`${LOCAL_URL}/api/testing/metrics?days=1`, {
        headers: {
          'x-admin-secret': ADMIN_SECRET
        }
      });
      const metricsData = await metricsRes.json();

      console.log('\n=== TEST RESULTS ===');
      if (metricsData.metrics?.recent_runs?.length > 0) {
        const recentRun = metricsData.metrics.recent_runs[0];
        console.log('Most recent test:');
        console.log(`  Status: ${recentRun.status}`);
        console.log(`  WER: ${recentRun.transcript_wer ? (recentRun.transcript_wer * 100).toFixed(1) + '%' : 'N/A'}`);
        console.log(`  Execution time: ${recentRun.total_execution_time_ms}ms`);

        if (recentRun.error_message) {
          console.log(`  Error: ${recentRun.error_message}`);
        }

        if (recentRun.status === 'completed') {
          console.log('\n✅ TEST SUCCESSFUL!');
          console.log('The complete flow is working:');
          console.log('  1. Test case created with local MP3');
          console.log('  2. Audio transcribed');
          console.log('  3. Accuracy test completed');
          console.log('  4. WER score calculated');
        }
      }
    } catch (error) {
      console.error('Error getting results:', error);
    }
  }

  // Step 5: Check system health
  console.log('\nStep 5: Final system health check...');
  try {
    const healthRes = await fetch(`${LOCAL_URL}/api/testing/monitor`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const healthData = await healthRes.json();

    console.log(`System health: ${healthData.health_score}/100 - ${healthData.status}`);

    if (healthData.issues?.length > 0) {
      console.log('Issues found:', healthData.issues.join(', '));
    }
  } catch (error) {
    console.error('Health check error:', error);
  }

  console.log('\n=== COMPLETE ===');
  console.log('\nYou can now:');
  console.log('1. Upload more MP3 files to test');
  console.log('2. View results at http://localhost:3000/testing/dashboard');
  console.log('3. Import your 1249 calls for comprehensive testing');
}

// Run the test
testLocalMP3().catch(console.error);