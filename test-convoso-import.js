// Test Convoso connection for AI testing import
fetch('http://localhost:3000/api/testing/import-convoso-calls', {
  headers: {
    'x-admin-secret': 'your-unique-admin-secret-key'
  }
})
.then(r => r.json())
.then(data => {
  console.log('Connection Status:', data);
  if (data.connected) {
    console.log('✅ Convoso connected:', data.account);
    
    // Now test import with a small request
    console.log('\n📥 Testing import with 1 recent call...');
    return fetch('http://localhost:3000/api/testing/import-convoso-calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'your-unique-admin-secret-key'
      },
      body: JSON.stringify({
        suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
        days_back: 7,
        limit: 1,
        min_duration: 10,
        max_duration: 300
      })
    }).then(r => r.json());
  } else {
    console.error('❌ Convoso not connected:', data);
    console.log('Setup instructions:', data.setup_instructions);
    return null;
  }
})
.then(result => {
  if (result) {
    console.log('\n📊 Import Result:', result);
    if (result.success) {
      console.log('✅ Successfully imported', result.imported, 'calls');
      if (result.details?.imported?.length > 0) {
        console.log('Imported calls:', result.details.imported);
      }
    } else {
      console.error('❌ Import failed:', result.error);
    }
  }
})
.catch(err => {
  console.error('Error:', err);
});
