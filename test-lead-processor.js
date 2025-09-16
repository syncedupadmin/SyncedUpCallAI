// Test script for lead processor functionality
const fs = require('fs');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_FILE = 'test-lead-upload.txt';

// Read test file
const leadIds = fs.readFileSync(TEST_FILE, 'utf-8')
  .split('\n')
  .map(id => id.trim())
  .filter(id => id);

console.log('🔍 Lead Processor Test');
console.log('====================');
console.log(`Found ${leadIds.length} lead IDs in ${TEST_FILE}`);
console.log('Sample IDs:', leadIds.slice(0, 5));

// Test configuration
const testConfig = {
  lead_ids: leadIds,
  batch_size: 5,      // Small batch for testing
  delay_ms: 500,      // 500ms delay between calls
  dry_run: true,      // Dry run first for safety
  skip_existing: true
};

console.log('\n📋 Test Configuration:');
console.log(JSON.stringify(testConfig, null, 2));

// Function to test the endpoint
async function testLeadProcessor() {
  console.log('\n🚀 Testing Lead Processor Endpoint...\n');

  try {
    // First, check endpoint status
    console.log('1️⃣ Checking endpoint status...');
    const statusResponse = await fetch(`${API_URL}/api/admin/process-lead-ids`, {
      method: 'GET'
    });

    if (statusResponse.ok) {
      const status = await statusResponse.json();
      console.log('✅ Endpoint is available');
      console.log('Current stats:', status.upload_stats);
    } else {
      console.log('⚠️ Status check returned:', statusResponse.status);
    }

    // Test with dry run
    console.log('\n2️⃣ Testing with dry run (preview mode)...');
    const dryRunResponse = await fetch(`${API_URL}/api/admin/process-lead-ids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testConfig)
    });

    if (!dryRunResponse.ok) {
      console.error('❌ Dry run failed:', dryRunResponse.status);
      return;
    }

    // Process SSE stream
    const reader = dryRunResponse.body.getReader();
    const decoder = new TextDecoder();
    let lastProgress = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.progress) {
              lastProgress = data.progress;

              // Display progress
              if (data.progress.current_lead) {
                console.log(`  Processing: ${data.progress.current_lead} (${data.progress.current}/${data.progress.total})`);
              }

              if (data.progress.status === 'complete') {
                console.log('\n✅ Dry run completed successfully!');
                console.log('Results:', data.progress.stats);
              } else if (data.progress.status === 'error') {
                console.log('\n❌ Error:', data.progress.message);
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

    // Ask user if they want to proceed with actual processing
    console.log('\n3️⃣ Dry run complete. To process for real:');
    console.log('   - Set dry_run: false in the config');
    console.log('   - Ensure CONVOSO_AUTH_TOKEN is set');
    console.log('   - Re-run this script');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testLeadProcessor().catch(console.error);