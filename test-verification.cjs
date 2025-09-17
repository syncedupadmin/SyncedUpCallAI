const fetch = require('node-fetch');

const SUPABASE_URL = 'https://sbvxvheirbjwfbqjreor.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNidnh2aGVpcmJqd2ZicWpyZW9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzNDMxNDEsImV4cCI6MjA0ODkxOTE0MX0.xRTci2BnmwD9jhXoaJQ90OMSQGcRLRa6aiFLW8nIEow';

async function runTests() {
  console.log('=== PHASE F: END-TO-END VERIFICATION ===\n');

  // Test 1: Sign in as admin
  console.log('1. Testing admin sign-in:');
  const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: 'admin@syncedupsolutions.com',
      password: 'Admin$up3r2024!' // You'll need to provide the actual password
    })
  });

  const signInData = await signInRes.json();

  if (signInData.access_token) {
    console.log('✅ Sign-in successful');
    const token = signInData.access_token;

    // Test 2: Check is_super_admin
    console.log('\n2. Testing is_super_admin RPC:');
    const adminRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_super_admin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      }
    });

    const isSuper = await adminRes.json();
    console.log('is_super_admin result:', isSuper);
    console.log(isSuper === true ? '✅ Admin verified' : '❌ Not admin');

    // Test 3: Test create_agent_user RPC
    console.log('\n3. Testing create_agent_user RPC:');
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_agent_user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_email: 'test@example.com',
        agent_name: 'Test Agent',
        agent_phone: '555-1234'
      })
    });

    const createData = await createRes.json();
    console.log('create_agent_user result:', createData);

    if (createData.ok === false) {
      if (createData.error === 'auth_user_not_found') {
        console.log('✅ Function works correctly (user not in auth.users)');
      } else {
        console.log('⚠️ Function returned error:', createData.error);
      }
    } else {
      console.log('✅ Agent created successfully');
    }

  } else {
    console.log('❌ Sign-in failed:', signInData);
    console.log('Please update the password in the test script');
  }

  // Test 4: Check admin route
  console.log('\n4. Testing /api/auth/admin route:');
  console.log('Run locally: npm run dev');
  console.log('Then: curl http://localhost:3000/api/auth/admin -H "Cookie: <your-auth-cookies>"');
}

runTests().catch(console.error);