// CHECK STATUS OF TESTS
const API_URL = 'http://localhost:3000';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';

async function checkStatus() {
  console.log('=== CHECKING TEST STATUS ===\n');

  // Check metrics
  const metricsRes = await fetch(`${API_URL}/api/testing/metrics?days=1`, {
    headers: { 'x-admin-secret': ADMIN_SECRET }
  });
  const metrics = await metricsRes.json();

  console.log('Test Metrics (Last 24 hours):');
  if (metrics.metrics?.overall) {
    const o = metrics.metrics.overall;
    console.log(`  Total tests: ${o.total_tests}`);
    console.log(`  Successful: ${o.successful_tests}`);
    console.log(`  Failed: ${o.failed_tests}`);
    if (o.avg_wer) {
      console.log(`  Average WER: ${(o.avg_wer * 100).toFixed(1)}%`);
    }
  }

  // Check monitor
  const monitorRes = await fetch(`${API_URL}/api/testing/monitor`, {
    headers: { 'x-admin-secret': ADMIN_SECRET }
  });
  const monitor = await monitorRes.json();

  console.log('\nTranscription Queue:');
  if (monitor.metrics?.transcription_queue) {
    const q = monitor.metrics.transcription_queue;
    console.log(`  Pending: ${q.pending}`);
    console.log(`  Processing: ${q.processing}`);
    console.log(`  Completed: ${q.completed}`);
    console.log(`  Failed: ${q.failed}`);
  }

  console.log('\nSystem Health:');
  console.log(`  Score: ${monitor.health_score}/100`);
  console.log(`  Status: ${monitor.status}`);

  if (monitor.issues?.length > 0) {
    console.log('\nIssues:');
    monitor.issues.forEach(issue => console.log(`  - ${issue}`));
  }

  // Check recent runs
  if (metrics.metrics?.recent_runs?.length > 0) {
    console.log('\nRecent Test Runs:');
    metrics.metrics.recent_runs.slice(0, 5).forEach(run => {
      const status = run.status === 'completed' ? '✅' : '❌';
      console.log(`  ${status} ${run.test_case_name || 'Unknown'} - ${run.status}`);
      if (run.transcript_wer) {
        console.log(`     WER: ${(run.transcript_wer * 100).toFixed(1)}%`);
      }
      if (run.error_message) {
        console.log(`     Error: ${run.error_message}`);
      }
    });
  }

  console.log('\n📊 View full dashboard: http://localhost:3000/testing/dashboard');
}

checkStatus().catch(console.error);