# AI Transcription Testing System - Console Commands

Copy and paste these commands into your browser console while on the testing dashboard page.

## 1. Initialize the Testing System

```javascript
// Step 1: Create the database tables (run this SQL in Supabase SQL editor)
/*
-- Paste the content from supabase/migrations/20240124_create_testing_system.sql
*/

// Step 2: Verify system is ready
fetch('/api/testing/verify-system')
  .then(r => r.json())
  .then(data => {
    console.log('System Status:', data.status);
    console.log('Checks:', data.checks);
    if (data.ready) {
      console.log('✅ System is ready!');
    } else {
      console.log('❌ System needs fixes:', data.message);
    }
  });

// Step 3: Initialize system if needed
fetch('/api/testing/verify-system', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ action: 'init' })
}).then(r => r.json()).then(console.log);
```

## 2. Create Your First Test Suite

```javascript
// Create a new test suite
async function createTestSuite() {
  const response = await fetch('/api/testing/create-suite', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      name: 'Production Testing Suite',
      description: 'Testing Deepgram accuracy on real calls',
      config: {
        wer_threshold: 15,
        min_accuracy: 85,
        models: ['nova-2'],
        language: 'en-US'
      }
    })
  });
  const suite = await response.json();
  console.log('Created suite:', suite);
  return suite.suite?.id;
}

// Run this to create suite
createTestSuite().then(suiteId => {
  console.log('Suite ID:', suiteId);
  window.testSuiteId = suiteId; // Save for later use
});
```

## 3. Find and Import High-Quality Calls

```javascript
// Find good calls from your database
async function findGoodCalls() {
  const response = await fetch('/api/testing/find-good-calls');
  const data = await response.json();
  console.log(`Found ${data.total_found} suitable calls`);
  console.log('High quality calls:', data.high_quality_calls);
  return data;
}

// Import the best calls into your test suite
async function importBestCalls(limit = 5) {
  // First, find good calls
  const callData = await findGoodCalls();

  // Get the suite ID (use existing or create new)
  let suiteId = window.testSuiteId || callData.suite_id;

  if (suiteId === 'create-new-suite') {
    const suite = await createTestSuite();
    suiteId = suite;
  }

  // Select best calls
  const callIds = callData.high_quality_calls
    .slice(0, limit)
    .map(c => c.id);

  // Import them
  const response = await fetch('/api/testing/import-batch', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      suite_id: suiteId,
      call_ids: callIds
    })
  });

  const result = await response.json();
  console.log(`Imported ${result.imported} test cases`);
  return result;
}

// Run this to import 5 best calls
importBestCalls(5).then(console.log);
```

## 4. Quick Import from Convoso

```javascript
// Quick import - finds and imports best recent calls automatically
async function quickImport() {
  const response = await fetch('/api/testing/import-batch');
  const suggestions = await response.json();

  if (suggestions.suggestions.length === 0) {
    console.log('No suitable calls found');
    return;
  }

  console.log(`Found ${suggestions.suggestions.length} suitable calls`);

  // Import top 5
  const importResponse = await fetch('/api/testing/import-batch', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      auto_create_suite: true,
      call_ids: suggestions.suggestions.slice(0, 5).map(s => s.id)
    })
  });

  const result = await importResponse.json();
  console.log('Import result:', result);
  window.testSuiteId = result.suite_id; // Save suite ID
  return result;
}

// Run quick import
quickImport();
```

## 5. Run Tests

```javascript
// Run all tests in a suite
async function runTests(suiteId) {
  suiteId = suiteId || window.testSuiteId;

  if (!suiteId) {
    console.error('No suite ID. Create a suite first!');
    return;
  }

  console.log('Starting test run for suite:', suiteId);

  const response = await fetch(`/api/testing/run/${suiteId}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ run_all: true })
  });

  const result = await response.json();
  console.log('Test Results:');
  console.log(`✅ Passed: ${result.passed}`);
  console.log(`❌ Failed: ${result.failed}`);
  console.log(`📊 Average WER: ${result.results?.[0]?.wer || 'N/A'}%`);
  console.log('Details:', result);
  return result;
}

// Run tests on current suite
runTests();
```

## 6. Quick Test Run (Single Test)

```javascript
// Run a quick test with a single call
async function quickTestRun() {
  // Find one good call
  const response = await fetch('/api/testing/find-good-calls');
  const data = await response.json();

  if (!data.high_quality_calls?.length) {
    console.log('No calls found');
    return;
  }

  const call = data.high_quality_calls[0];
  console.log('Testing call:', call.id);

  // Import it
  const importRes = await fetch('/api/testing/import-batch', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      auto_create_suite: true,
      call_ids: [call.id]
    })
  });

  const importData = await importRes.json();

  // Run test
  const testRes = await fetch(`/api/testing/run/${importData.suite_id}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ run_all: true })
  });

  const result = await testRes.json();
  console.log('Quick test result:', result);
  return result;
}

// Run quick test
quickTestRun();
```

## 7. View Metrics

```javascript
// Get current metrics
async function getMetrics() {
  const response = await fetch('/api/testing/metrics');
  const metrics = await response.json();

  console.log('=== Testing Metrics ===');
  console.log(`Total Tests: ${metrics.total_tests}`);
  console.log(`Tests Passed: ${metrics.completed}`);
  console.log(`Tests Failed: ${metrics.failed}`);
  console.log(`Average WER: ${metrics.wer_label}`);
  console.log(`Success Rate: ${metrics.success_rate}`);
  console.log(`Tests Last 7 Days: ${metrics.tests_last_7d}`);
  console.log(`Avg Processing Time: ${metrics.avg_processing_time}ms`);

  return metrics;
}

// View metrics
getMetrics();
```

## 8. Complete Setup and Test Flow

```javascript
// Run this for complete setup and test
async function completeSetupAndTest() {
  console.log('🚀 Starting complete setup and test...');

  // 1. Verify system
  console.log('1️⃣ Verifying system...');
  const verifyRes = await fetch('/api/testing/verify-system');
  const verify = await verifyRes.json();

  if (!verify.ready) {
    console.log('System not ready. Initializing...');
    await fetch('/api/testing/verify-system', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ action: 'init' })
    });
  }

  // 2. Create test suite
  console.log('2️⃣ Creating test suite...');
  const suiteRes = await fetch('/api/testing/create-suite', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      name: 'Auto Test Suite ' + new Date().toISOString(),
      description: 'Automated testing suite'
    })
  });
  const suite = await suiteRes.json();
  const suiteId = suite.suite?.id;

  // 3. Find good calls
  console.log('3️⃣ Finding good calls...');
  const callsRes = await fetch('/api/testing/find-good-calls');
  const calls = await callsRes.json();

  if (!calls.calls?.length) {
    console.log('❌ No suitable calls found in database');
    return;
  }

  // 4. Import calls
  console.log('4️⃣ Importing test cases...');
  const callIds = calls.calls.slice(0, 3).map(c => c.id); // Import 3 calls
  const importRes = await fetch('/api/testing/import-batch', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      suite_id: suiteId,
      call_ids: callIds
    })
  });
  const imported = await importRes.json();

  // 5. Run tests
  console.log('5️⃣ Running tests...');
  const testRes = await fetch(`/api/testing/run/${suiteId}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ run_all: true })
  });
  const results = await testRes.json();

  // 6. Display results
  console.log('✅ Complete! Results:');
  console.log(`Suite ID: ${suiteId}`);
  console.log(`Tests Run: ${results.total_tests}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);

  // Save for later
  window.testSuiteId = suiteId;

  return { suite: suite, results: results };
}

// RUN THIS TO TEST EVERYTHING
completeSetupAndTest();
```

## 9. Refresh Dashboard

```javascript
// Force refresh dashboard data
function refreshDashboard() {
  window.location.reload();
}

// Or if you have a refresh function in your component
if (window.refreshTestingData) {
  window.refreshTestingData();
}
```

## Troubleshooting

If you get errors:

1. **"Unauthorized"** - Make sure you're logged in
2. **"No test cases found"** - Import some calls first
3. **"Test suite not found"** - Create a suite first
4. **Database errors** - Run the migration SQL first

Check system status:
```javascript
fetch('/api/testing/verify-system').then(r => r.json()).then(console.log);
```

View all test suites:
```javascript
fetch('/api/testing/create-suite').then(r => r.json()).then(console.log);
```