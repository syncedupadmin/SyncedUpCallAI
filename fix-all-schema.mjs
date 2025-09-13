import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel',
  ssl: { rejectUnauthorized: false }
});

async function fixAllSchema() {
  try {
    console.log('Adding missing columns to transcripts table...');
    
    // Add created_at column
    await pool.query(`
      ALTER TABLE transcripts 
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
    `);
    console.log('✅ Added created_at column');
    
    // Check if embeddings table exists and create if not
    await pool.query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        call_id UUID PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
        embedding vector(1536),
        model VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Ensured embeddings table exists');
    
    console.log('\n✅ All schema updates complete!');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixAllSchema();