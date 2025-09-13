import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel',
  ssl: { rejectUnauthorized: false }
});

async function updateWithDropbox() {
  // Convert to direct download link by changing dl=0 to dl=1
  const dropboxUrl = 'https://www.dropbox.com/scl/fi/bpz5rnnb2zcr1dvh97oki/103833_1110461_8133265050_10307113_4123_1757508132_0984.mp3?rlkey=v5mrc4t63y5gxxlhridu4ekmq&st=87sxcubp&dl=1';
  const callId = '161388cf-ebcc-43c6-9051-f375a5d13898';
  
  console.log('📞 Updating call with Dropbox recording...');
  console.log('URL:', dropboxUrl);
  
  try {
    // Update to Dropbox MP3
    await pool.query(
      'UPDATE calls SET recording_url = $1 WHERE id = $2',
      [dropboxUrl, callId]
    );
    console.log('✅ Updated recording URL\n');
    
    // Clear any existing transcript first
    await pool.query('DELETE FROM transcripts WHERE call_id = $1', [callId]);
    console.log('✅ Cleared old transcript\n');
    
    // Test transcription
    console.log('🎤 Testing transcription with your actual call recording...');
    const res = await fetch('https://synced-up-call-ai.vercel.app/api/ui/trigger/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: callId })
    });
    
    const data = await res.json();
    
    if (data.ok) {
      console.log('✅ TRANSCRIPTION STARTED!');
      console.log('\n📊 Your call is being transcribed!');
      console.log('Go to: https://synced-up-call-ai.vercel.app/dashboard');
      console.log('You can now click "Analyze" after transcription completes (30-60 seconds)');
    } else {
      console.log('❌ Error:', data.error);
      if (data.details) console.log('Details:', data.details);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

updateWithDropbox();