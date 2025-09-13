import pg from 'pg';
const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: 'postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel',
  ssl: { rejectUnauthorized: false }
});

async function updateRecordingUrl() {
  const callId = '161388cf-ebcc-43c6-9051-f375a5d13898';
  const directUrl = 'https://drive.google.com/uc?export=download&id=1sZiEv3L1sHFe5_LUrZQOnmok9JuhY9g-';
  
  try {
    // Update the recording URL
    const result = await pool.query(
      'UPDATE calls SET recording_url = $1 WHERE id = $2 RETURNING id, recording_url',
      [directUrl, callId]
    );
    
    if (result.rowCount > 0) {
      console.log('✅ Updated recording URL for call:', callId);
      console.log('New URL:', directUrl);
    } else {
      console.log('❌ Call not found:', callId);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

updateRecordingUrl();