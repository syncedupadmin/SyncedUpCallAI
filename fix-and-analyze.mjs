import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel',
  ssl: { rejectUnauthorized: false }
});

async function fixAndAnalyze() {
  const callId = '161388cf-ebcc-43c6-9051-f375a5d13898';
  
  try {
    // Create transcript_embeddings table if needed
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transcript_embeddings (
        call_id UUID PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
        embedding vector(1536),
        model VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Ensured transcript_embeddings table exists');
    
    // Now trigger analysis
    console.log('\n🤖 Triggering AI analysis of the call...');
    const res = await fetch('https://synced-up-call-ai.vercel.app/api/ui/trigger/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: callId })
    });
    
    const data = await res.json();
    
    if (data.ok) {
      console.log('✅ Analysis started successfully!');
      console.log('\n📊 View your fully analyzed call at:');
      console.log(`https://synced-up-call-ai.vercel.app/call/${callId}`);
      console.log('\nThe analysis will extract:');
      console.log('- Call outcome reasons');
      console.log('- QA score (0-100)');
      console.log('- Customer sentiment');
      console.log('- Risk flags');
      console.log('- Key quotes');
      console.log('- Summary');
    } else {
      console.log('❌ Analysis error:', data.error);
      if (data.details) console.log('Details:', data.details);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixAndAnalyze();