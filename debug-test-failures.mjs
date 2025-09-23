// Debug why tests are failing
const API_URL = 'https://synced-up-call-ai.vercel.app';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';

async function debugTestFailures() {
  console.log('=== DEBUGGING TEST FAILURES ===\n');

  // Get detailed metrics with error information
  try {
    const metricsRes = await fetch(`${API_URL}/api/testing/metrics?days=1`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const metricsData = await metricsRes.json();

    if (metricsData.metrics?.recent_runs?.length > 0) {
      console.log('Recent test runs with errors:');
      metricsData.metrics.recent_runs.forEach(run => {
        if (run.status === 'failed') {
          console.log(`\n❌ Test Case: ${run.test_case_name}`);
          console.log(`   Status: ${run.status}`);
          console.log(`   Error: ${run.error_message || 'No error message'}`);
          console.log(`   Audio URL: ${run.audio_url}`);
          console.log(`   Created: ${run.created_at}`);
        }
      });
    }

    // Check failure reasons from monitor
    const monitorRes = await fetch(`${API_URL}/api/testing/monitor?hours=24`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const monitorData = await monitorRes.json();

    if (monitorData.failures?.by_reason?.length > 0) {
      console.log('\n=== FAILURE REASONS (Last 24 hours) ===');
      monitorData.failures.by_reason.forEach(reason => {
        console.log(`\n${reason.count} failures with error:`);
        console.log(`  "${reason.error_message}"`);
        console.log(`  Last occurred: ${reason.last_occurred}`);
      });
    }

    if (monitorData.failures?.invalid_audio_urls?.length > 0) {
      console.log('\n=== TEST CASES WITH INVALID AUDIO URLS ===');
      monitorData.failures.invalid_audio_urls.forEach(test => {
        console.log(`\nTest Case ID: ${test.id}`);
        console.log(`  Name: ${test.name}`);
        console.log(`  Audio URL: ${test.audio_url}`);
        console.log(`  Error: ${test.error_message}`);
        console.log(`  Failure count: ${test.failure_count}`);
      });
    }
  } catch (error) {
    console.error('Failed to get debug info:', error);
  }

  // Check if we can validate audio URLs
  console.log('\n=== CHECKING AUDIO URL VALIDATION ===');
  try {
    const validateRes = await fetch(`${API_URL}/api/testing/validate-audio-urls`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const validateData = await validateRes.json();
    console.log('Validation response:', JSON.stringify(validateData, null, 2));
  } catch (error) {
    console.error('Failed to validate audio URLs:', error);
  }

  // Get suite details to see test cases
  console.log('\n=== TEST SUITE DETAILS ===');
  try {
    const suitesRes = await fetch(`${API_URL}/api/testing/suites`, {
      headers: {
        'x-admin-secret': ADMIN_SECRET
      }
    });
    const suitesData = await suitesRes.json();

    const suite = suitesData.suites?.find(s => s.id === '876b6b65-ddaa-42fe-aecd-80457cb66035');
    if (suite) {
      console.log(`Suite: ${suite.name}`);
      console.log(`Total test cases: ${suite.test_case_count}`);
      console.log(`Active test cases: ${suite.active_test_cases}`);
      console.log(`Last run: ${suite.last_run_at || 'Never'}`);
      console.log(`Success rate: ${suite.success_rate ? (suite.success_rate * 100).toFixed(1) + '%' : 'N/A'}`);
    }
  } catch (error) {
    console.error('Failed to get suite details:', error);
  }
}

debugTestFailures().catch(console.error);