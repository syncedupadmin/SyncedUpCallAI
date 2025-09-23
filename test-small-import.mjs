// Test small import
async function testSmallImport() {
  console.log('Testing small import of 5 calls...\n');

  const res = await fetch('https://synced-up-call-ai.vercel.app/api/testing/import-convoso-calls', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo='
    },
    body: JSON.stringify({
      suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
      days_back: 2,
      limit: 5
    })
  });

  console.log('Status:', res.status);
  console.log('Status Text:', res.statusText);

  const text = await res.text();
  console.log('Response:', text);

  try {
    const data = JSON.parse(text);
    console.log('\nParsed data:');
    console.log('Success:', data.success);
    console.log('Imported:', data.imported);
    console.log('Failed:', data.failed);
  } catch (e) {
    console.log('Failed to parse as JSON');
  }
}

testSmallImport().catch(console.error);