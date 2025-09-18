#!/usr/bin/env node

/**
 * Test Convoso API with authentication
 * Simulates what the frontend ConvosoImporter does
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Test credentials (you'll need to replace with real ones)
const TEST_EMAIL = 'admin@syncedupsolutions.com';
const TEST_PASSWORD = 'your_password_here'; // Replace this

async function testWithAuth() {
  console.log('Testing Convoso search with authentication...\n');

  // Step 1: Sign in to get auth token
  console.log('Step 1: Signing in to Supabase...');

  const signInResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      gotrue_meta_security: {}
    })
  });

  if (!signInResponse.ok) {
    console.error('Failed to sign in:', await signInResponse.text());
    console.log('\n⚠️  You need to update the TEST_PASSWORD in this script');
    return;
  }

  const authData = await signInResponse.json();
  const accessToken = authData.access_token;
  console.log('✅ Got access token:', accessToken.substring(0, 20) + '...\n');

  // Step 2: Test the search endpoint with auth
  console.log('Step 2: Testing /api/convoso/search with auth...');

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateFrom = yesterday.toISOString().split('T')[0];
  const dateTo = today.toISOString().split('T')[0];

  const searchUrl = `http://localhost:3000/api/convoso/search?dateFrom=${dateFrom}&dateTo=${dateTo}`;

  const searchResponse = await fetch(searchUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  console.log('Response status:', searchResponse.status);

  if (searchResponse.ok) {
    const data = await searchResponse.json();
    console.log('✅ SUCCESS! Got data:');
    console.log('- Total calls:', data.calls?.length || 0);
    console.log('- Filter options:', Object.keys(data.filterOptions || {}));

    if (data.calls && data.calls.length > 0) {
      console.log('\nSample call:');
      const sample = data.calls[0];
      console.log('- Recording ID:', sample.recording_id);
      console.log('- Customer:', `${sample.customer_first_name} ${sample.customer_last_name}`);
      console.log('- Agent:', sample.agent_name);
      console.log('- Duration:', sample.duration_seconds, 'seconds');
      console.log('- Disposition:', sample.disposition);
    }
  } else {
    const error = await searchResponse.json();
    console.log('❌ Failed:', error);
  }
}

// Test without auth first
async function testWithoutAuth() {
  console.log('Testing without authentication...');
  const response = await fetch('http://localhost:3000/api/convoso/search?dateFrom=2025-09-17&dateTo=2025-09-18');
  console.log('Status:', response.status);
  const data = await response.json();
  console.log('Response:', data);
  console.log('');
}

async function runTests() {
  try {
    // Test without auth
    await testWithoutAuth();

    // Test with auth
    // await testWithAuth(); // Uncomment and set password to test

    console.log('\n📝 NOTE: To test with authentication:');
    console.log('1. Edit this script and set TEST_PASSWORD');
    console.log('2. Uncomment the testWithAuth() call');
    console.log('3. Run the script again');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

runTests();