import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const authToken = process.env.CONVOSO_AUTH_TOKEN;
if (!authToken) {
  console.error('CONVOSO_AUTH_TOKEN not found in .env.local');
  process.exit(1);
}

async function testUserRecordingsAPI(userEmail) {
  console.log(`\n=== TESTING USER RECORDINGS API DETAILED ===`);
  console.log(`Testing with email/name: ${userEmail}\n`);

  const endpoint = 'https://api.convoso.com/v1/users/recordings';

  console.log(`Testing POST ${endpoint}...`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        auth_token: authToken,
        user: userEmail,
        limit: 5  // Get 5 recordings for testing
      })
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`\nFull Response:`);
      console.log(JSON.stringify(data, null, 2));

      // Check if it's an error response
      if (data.success === false) {
        console.log(`\n❌ API returned error: ${data.text || data.message}`);
      } else if (data.success === true) {
        console.log(`\n✅ API returned success`);
        if (data.data) {
          console.log(`Has data field:`, data.data);
        }
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ Failed:`, errorText);
    }
  } catch (error) {
    console.log(`❌ Network error: ${error.message}`);
  }
}

// Test with both agent name and possible email formats
console.log('Testing with agent name from database...');
await testUserRecordingsAPI('Test Agent 4123');

console.log('\n\nTesting with email format...');
await testUserRecordingsAPI('testagent4123@example.com');

console.log('\n\nTesting with another agent...');
await testUserRecordingsAPI('John Smith');

process.exit(0);