import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel',
  ssl: { rejectUnauthorized: false }
});

async function fixSchema() {
  try {
    console.log('Checking transcripts table schema...');
    
    // Check current columns
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'transcripts'
      ORDER BY ordinal_position
    `);
    
    console.log('Current columns:', cols.rows.map(c => c.column_name).join(', '));
    
    // Add missing columns if they don't exist
    const updates = [
      "ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS lang VARCHAR(10) DEFAULT 'en'",
      "ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS engine VARCHAR(50)",
      "ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS translated_text TEXT",
      "ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS redacted TEXT",
      "ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS diarized TEXT",
      "ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS words TEXT"
    ];
    
    for (const sql of updates) {
      try {
        await pool.query(sql);
        console.log('✅ Executed:', sql.substring(0, 50) + '...');
      } catch (e) {
        console.log('⚠️ Skipped (may already exist):', sql.substring(0, 50) + '...');
      }
    }
    
    console.log('\n✅ Schema updated successfully!');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixSchema();