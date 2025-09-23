const fetch = require('node:fetch');

async function testConvosoImport() {
  console.log('Testing Convoso import...\n');
  
  try {
    const response = await fetch('http://localhost:3000/api/testing/import-convoso-calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo='
      },
      body: JSON.stringify({
        suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
        days_back: 7,
        limit: 2,
        min_duration: 10,
        max_duration: 300
      })
    });
    
    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n✅ Successfully imported', result.imported, 'calls from Convoso!');
      if (result.details?.imported?.length > 0) {
        console.log('\nImported calls:');
        result.details.imported.forEach(call => {
          console.log(`  - Test case ${call.test_case_id}: ${call.agent} (${call.duration}s)`);
        });
      }
      if (result.next_steps) {
        console.log('\nNext steps:');
        result.next_steps.forEach((step, i) => {
          console.log(`  ${i+1}. ${step}`);
        });
      }
    } else {
      console.error('❌ Import failed:', result.error || result.message);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testConvosoImport();
