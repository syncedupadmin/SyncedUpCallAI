async function testFixedConvosoImport() {
  console.log('Testing FIXED Convoso import with working logic...\n');

  try {
    const response = await fetch('http://localhost:3000/api/testing/import-convoso-calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo='
      },
      body: JSON.stringify({
        suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
        days_back: 30,  // Look back 30 days
        limit: 10        // Get 10 calls
      })
    });

    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ Successfully imported', result.imported, 'calls from Convoso!');
      if (result.details?.imported?.length > 0) {
        console.log('\nImported calls:');
        result.details.imported.forEach((call, i) => {
          console.log(`\n${i+1}. Test case ${call.test_case_id}:`);
          console.log(`   Agent: ${call.agent}`);
          console.log(`   Duration: ${call.duration} seconds`);
          console.log(`   Convoso ID: ${call.convoso_id}`);
        });
      }
      if (result.details?.failed?.length > 0) {
        console.log('\n⚠️ Failed imports:');
        result.details.failed.forEach(fail => {
          console.log(`  - ${fail.convoso_id}: ${fail.error}`);
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

testFixedConvosoImport();