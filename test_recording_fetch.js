// Test if recording fetch is working with Convoso API
const fetch = require('node-fetch');

async function testRecordingFetch() {
  const authToken = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';
  const apiBase = 'https://api.convoso.com/v1';
  
  // Test with a sample lead_id
  const params = new URLSearchParams({
    auth_token: authToken,
    limit: '1'
  });
  
  // Try to get any recordings
  const url = `${apiBase}/leads/get-recordings?${params.toString()}`;
  
  console.log('Testing Convoso recording fetch...');
  console.log('URL:', url);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.data?.entries?.length > 0) {
      console.log('\n✓ Found recordings!');
      console.log('First recording URL:', data.data.entries[0].url);
    } else {
      console.log('\n✗ No recordings found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testRecordingFetch();
