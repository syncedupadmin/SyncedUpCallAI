import pg from 'pg';
const { Pool } = pg;

// Exact connection string from Supabase assistant
const connectionString = 'postgres://postgres.sbvxvheirbjwfbqjreor:fhhbrtnfnbftcb45151@aws-0-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel';

console.log('Testing with exact Supabase configuration...');
console.log('Connection string (masked):', connectionString.replace(/:[^@]+@/, ':****@'));

// Test with the same config as our db.ts
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() as time, current_database() as db');
    console.log('✅ SUCCESS! Connection works!');
    console.log('Database:', result.rows[0].db);
    console.log('Server time:', result.rows[0].time);
    
    // Test tables
    const tables = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Public tables count:', tables.rows[0].count);
    
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    console.error('Error code:', error.code);
    console.error('\nFull error:', error);
  } finally {
    await pool.end();
  }
}

testConnection();