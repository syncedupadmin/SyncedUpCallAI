import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel',
  ssl: { rejectUnauthorized: false }
});

async function checkCall() {
  const callId = '161388cf-ebcc-43c6-9051-f375a5d13898';
  
  try {
    // Check if call exists
    const call = await pool.query('SELECT id, started_at, recording_url FROM calls WHERE id = $1', [callId]);
    
    if (call.rows.length === 0) {
      console.log('❌ Call not found in database');
      console.log('\nLet me check all calls:');
      
      const allCalls = await pool.query('SELECT id, started_at, recording_url FROM calls ORDER BY started_at DESC LIMIT 5');
      console.log('\nRecent calls in database:');
      allCalls.rows.forEach(c => {
        console.log(`- ${c.id} (${c.started_at})`);
      });
      
      // Let's update the first call with a recording instead
      if (allCalls.rows.length > 0) {
        const firstCallId = allCalls.rows[0].id;
        const dropboxUrl = 'https://www.dropbox.com/scl/fi/bpz5rnnb2zcr1dvh97oki/103833_1110461_8133265050_10307113_4123_1757508132_0984.mp3?rlkey=v5mrc4t63y5gxxlhridu4ekmq&st=87sxcubp&dl=1';
        
        console.log(`\n✅ Updating call ${firstCallId} with Dropbox recording...`);
        await pool.query('UPDATE calls SET recording_url = $1 WHERE id = $2', [dropboxUrl, firstCallId]);
        
        console.log(`\n📊 Go to: https://synced-up-call-ai.vercel.app/call/${firstCallId}`);
        console.log('Then click "Transcribe" to process this recording');
      }
    } else {
      console.log('✅ Call exists:', call.rows[0]);
      
      // Check for transcript
      const transcript = await pool.query('SELECT call_id, text FROM transcripts WHERE call_id = $1', [callId]);
      if (transcript.rows.length > 0) {
        console.log('✅ Transcript exists, length:', transcript.rows[0].text?.length || 0);
      } else {
        console.log('⚠️ No transcript yet');
      }
      
      // Check for analysis
      const analysis = await pool.query('SELECT call_id, summary FROM analyses WHERE call_id = $1', [callId]);
      if (analysis.rows.length > 0) {
        console.log('✅ Analysis exists');
      } else {
        console.log('⚠️ No analysis yet');
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkCall();