import pg from 'pg';
const { Pool } = pg;

// Test connection string
const connectionString = 'postgres://postgres.sbvxvheirbjwfbqjreor:fhhbrtnfnbftcb45151@aws-0-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require&workaround=supabase-pooler.vercel';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    console.log('Testing connection to Supabase...');
    console.log('Connection string (masked):', connectionString.replace(/:[^@]+@/, ':****@'));
    
    const result = await pool.query('SELECT NOW() as current_time, current_database() as db');
    console.log('✅ Connection successful!');
    console.log('Database:', result.rows[0].db);
    console.log('Server time:', result.rows[0].current_time);
    
    // Test a simple table query
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      LIMIT 5
    `);
    console.log('Sample tables:', tablesResult.rows.map(r => r.table_name));
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Error code:', error.code);
    if (error.message.includes('Tenant')) {
      console.error('\nThis error typically means:');
      console.error('1. The password is incorrect');
      console.error('2. The project reference ID is wrong');
      console.error('3. The username format is incorrect');
    }
  } finally {
    await pool.end();
  }
}

testConnection();