// Check why transcriptions are stuck
const API_URL = 'https://synced-up-call-ai.vercel.app';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';

async function checkStuckTranscriptions() {
  console.log('=== CHECKING STUCK TRANSCRIPTIONS ===\n');

  // Get monitor data with more details
  try {
    const monitorRes = await fetch(`${API_URL}/api/testing/monitor?hours=1`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const monitorData = await monitorRes.json();

    console.log('Health Score:', monitorData.health_score);
    console.log('Status:', monitorData.status);

    if (monitorData.metrics?.transcription_queue) {
      const queue = monitorData.metrics.transcription_queue;
      console.log('\nTranscription Queue:');
      console.log('  Pending:', queue.pending);
      console.log('  Processing:', queue.processing);
      console.log('  Completed:', queue.completed);
      console.log('  Failed:', queue.failed);
      console.log('  Avg completion time:', queue.avg_completion_minutes, 'minutes');
    }

    if (monitorData.failures?.invalid_audio_urls?.length > 0) {
      console.log('\nInvalid Audio URLs:');
      monitorData.failures.invalid_audio_urls.forEach(url => {
        console.log(`  - Test case ${url.id}: ${url.name}`);
        console.log(`    Error: ${url.error_message}`);
        console.log(`    Failures: ${url.failure_count}`);
      });
    }

    if (monitorData.failures?.by_reason?.length > 0) {
      console.log('\nFailure Reasons:');
      monitorData.failures.by_reason.forEach(reason => {
        console.log(`  - ${reason.error_message} (${reason.count} times)`);
      });
    }

    if (monitorData.issues?.length > 0) {
      console.log('\nIssues:');
      monitorData.issues.forEach(issue => {
        console.log(`  - ${issue}`);
      });
    }

    if (monitorData.recommendations?.length > 0) {
      console.log('\nRecommendations:');
      monitorData.recommendations.forEach(rec => {
        console.log(`  - ${rec}`);
      });
    }
  } catch (error) {
    console.error('Failed to check monitor:', error);
  }

  // Try to run tests anyway to see what happens
  console.log('\n=== ATTEMPTING TO RUN TESTS ===');
  try {
    const runRes = await fetch(`${API_URL}/api/testing/run/876b6b65-ddaa-42fe-aecd-80457cb66035`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': ADMIN_SECRET
      },
      body: JSON.stringify({
        parallel: 1,  // Run one at a time to debug
        stopOnFailure: false
      })
    });

    const runData = await runRes.json();
    console.log('Run status:', runRes.status);
    console.log('Run response:', JSON.stringify(runData, null, 2));
  } catch (error) {
    console.error('Failed to run tests:', error);
  }

  // Check metrics to see if any tests have run
  console.log('\n=== CHECKING METRICS ===');
  try {
    const metricsRes = await fetch(`${API_URL}/api/testing/metrics?days=1`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const metricsData = await metricsRes.json();

    if (metricsData.metrics?.overall) {
      const overall = metricsData.metrics.overall;
      console.log('Tests in last 24 hours:');
      console.log('  Total:', overall.total_tests);
      console.log('  Successful:', overall.successful_tests);
      console.log('  Failed:', overall.failed_tests);
      console.log('  Avg WER:', overall.avg_wer ? (overall.avg_wer * 100).toFixed(1) + '%' : 'N/A');
    }

    if (metricsData.metrics?.recent_runs?.length > 0) {
      console.log('\nRecent test runs:');
      metricsData.metrics.recent_runs.slice(0, 5).forEach(run => {
        console.log(`  - ${run.test_case_name}: ${run.status} (WER: ${run.transcript_wer ? (run.transcript_wer * 100).toFixed(1) + '%' : 'N/A'})`);
        if (run.error_message) {
          console.log(`    Error: ${run.error_message}`);
        }
      });
    }
  } catch (error) {
    console.error('Failed to check metrics:', error);
  }
}

checkStuckTranscriptions().catch(console.error);