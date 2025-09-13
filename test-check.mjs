import pg from 'pg';
const { Pool } = pg;

// Test different variations to diagnose the issue
const connectionStrings = [
  // Your current DATABASE_URL
  'postgres://postgres.sbvxvheirbjwfbqjreor:fhhbrtnfnbftcb45151@aws-0-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel',
  
  // With postgresql:// protocol
  'postgresql://postgres.sbvxvheirbjwfbqjreor:fhhbrtnfnbftcb45151@aws-0-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel',
  
  // Without workaround parameter
  'postgres://postgres.sbvxvheirbjwfbqjreor:fhhbrtnfnbftcb45151@aws-0-us-east-2.pooler.supabase.com:6543/postgres',
  
  // Session pooler (port 5432)
  'postgres://postgres.sbvxvheirbjwfbqjreor:fhhbrtnfnbftcb45151@aws-0-us-east-2.pooler.supabase.com:5432/postgres',
];

async function testConnection(connStr, description) {
  console.log(`\nTesting: ${description}`);
  console.log('URL:', connStr.replace(/:[^@]+@/, ':****@'));
  
  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const result = await pool.query('SELECT 1');
    console.log('✅ SUCCESS!');
    return true;
  } catch (error) {
    console.log('❌ FAILED:', error.message);
    return false;
  } finally {
    await pool.end();
  }
}

async function runTests() {
  console.log('Testing different connection string variations...\n');
  
  await testConnection(connectionStrings[0], 'Current DATABASE_URL');
  await testConnection(connectionStrings[1], 'With postgresql:// protocol');
  await testConnection(connectionStrings[2], 'Without workaround parameter');
  await testConnection(connectionStrings[3], 'Session pooler (port 5432)');
  
  console.log('\n---\nIf ALL fail with "Tenant or user not found", the password may be incorrect.');
  console.log('Please double-check in Supabase Dashboard → Settings → Database → Database Password');
}

runTests();