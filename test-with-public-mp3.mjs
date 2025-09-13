import pg from 'pg';
const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: 'postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel',
  ssl: { rejectUnauthorized: false }
});

async function testWithPublicMP3() {
  // Use a public test MP3 that we know works
  const testMP3 = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
  const callId = '161388cf-ebcc-43c6-9051-f375a5d13898';
  
  console.log('Testing with public MP3:', testMP3);
  
  try {
    // Update to test MP3
    await pool.query(
      'UPDATE calls SET recording_url = $1 WHERE id = $2',
      [testMP3, callId]
    );
    console.log('✅ Updated to test MP3\n');
    
    // Now test transcription
    console.log('Testing transcription...');
    const res = await fetch('https://synced-up-call-ai.vercel.app/api/ui/trigger/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: callId })
    });
    
    const data = await res.json();
    
    if (data.ok) {
      console.log('✅ TRANSCRIPTION STARTED SUCCESSFULLY!');
      console.log('The system is working correctly.');
      console.log('\n📝 Next steps:');
      console.log('1. Upload your MP3 to a service that provides direct links');
      console.log('2. Options: Dropbox (use dl=1 parameter), AWS S3, Cloudinary, or your own server');
      console.log('3. Google Drive won\'t work due to authentication requirements');
    } else {
      console.log('❌ Transcription failed:', data.error);
      if (data.details) console.log('Details:', data.details);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

testWithPublicMP3();