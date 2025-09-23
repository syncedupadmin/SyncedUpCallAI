async function testQuickImport() {
  console.log('Testing Convoso import with minimal data...\n');

  try {
    const response = await fetch('http://localhost:3000/api/testing/import-convoso-calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo='
      },
      body: JSON.stringify({
        suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
        days_back: 1,  // Just last 1 day
        limit: 2        // Just 2 calls to test quickly
      })
    });

    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Response:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ Import successful!');
      console.log('Imported:', result.imported);
      console.log('Failed:', result.failed);
    } else {
      console.log('❌ Import failed:', result.error || result.message);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testQuickImport();