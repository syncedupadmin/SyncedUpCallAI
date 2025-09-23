// Test import with longer time period
async function testLongerImport() {
  console.log('Testing import of calls from last 60 days (max 20 calls)...\n');

  const res = await fetch('https://synced-up-call-ai.vercel.app/api/testing/import-convoso-calls', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo='
    },
    body: JSON.stringify({
      suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
      days_back: 60,  // Look back 60 days
      limit: 20       // Get up to 20 calls
    })
  });

  console.log('Status:', res.status);

  const data = await res.json();
  console.log('\nImport Results:');
  console.log('Success:', data.success);
  console.log('Imported:', data.imported);
  console.log('Failed:', data.failed);

  if (data.imported > 0 && data.details?.imported) {
    console.log('\nImported calls:');
    data.details.imported.forEach((call, i) => {
      console.log(`  ${i + 1}. Agent: ${call.agent}, Duration: ${call.duration}s`);
    });
  }

  if (data.imported === 0) {
    console.log('\n⚠️  No calls imported. This could mean:');
    console.log('  - No calls available in the specified period');
    console.log('  - All calls were already imported');
    console.log('  - Calls don\'t have valid recordings');
  }

  return data;
}

testLongerImport().catch(console.error);