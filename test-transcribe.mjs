// Test transcribe functionality
const APP_URL = 'https://synced-up-call-ai.vercel.app';

async function testTranscribe() {
  console.log('Testing transcribe functionality...\n');
  
  // First, get a call with a recording
  try {
    const callsRes = await fetch(`${APP_URL}/api/ui/calls?limit=5`);
    const callsData = await callsRes.json();
    
    if (!callsData.ok || !callsData.data?.length) {
      console.log('❌ No calls found in database');
      return;
    }
    
    // Find a call with a recording URL
    const callWithRecording = callsData.data.find(c => c.recording_url);
    
    if (!callWithRecording) {
      console.log('❌ No calls with recordings found');
      console.log('Available calls:', callsData.data.map(c => ({
        id: c.id,
        recording_url: c.recording_url,
        duration: c.duration_sec
      })));
      return;
    }
    
    console.log('📞 Found call with recording:');
    console.log('- ID:', callWithRecording.id);
    console.log('- Recording URL:', callWithRecording.recording_url);
    console.log('- Duration:', callWithRecording.duration_sec, 'seconds\n');
    
    // Test the transcribe trigger endpoint
    console.log('Testing /api/ui/trigger/transcribe endpoint...');
    const triggerRes = await fetch(`${APP_URL}/api/ui/trigger/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: callWithRecording.id })
    });
    
    const triggerText = await triggerRes.text();
    console.log('Response status:', triggerRes.status);
    console.log('Response:', triggerText);
    
    try {
      const triggerData = JSON.parse(triggerText);
      if (triggerData.ok) {
        console.log('✅ Transcribe triggered successfully!');
      } else {
        console.log('❌ Transcribe failed:', triggerData.error);
        if (triggerData.details) {
          console.log('Details:', triggerData.details);
        }
        if (triggerData.message) {
          console.log('Message:', triggerData.message);
        }
      }
    } catch (e) {
      console.log('Raw response (not JSON):', triggerText);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Also test if environment is configured
async function checkConfig() {
  console.log('\n=== Checking API Configuration ===\n');
  
  try {
    // Check health endpoint
    const healthRes = await fetch(`${APP_URL}/api/health/cron`);
    const healthData = await healthRes.json();
    console.log('Health check:', healthData.ok ? '✅ OK' : '❌ Failed');
    if (!healthData.ok) {
      console.log('Health error:', healthData.error);
    }
    
    // Check if we can reach the database
    const statsRes = await fetch(`${APP_URL}/api/ui/stats/safe`);
    const statsData = await statsRes.json();
    console.log('Database stats:', statsData.ok ? '✅ OK' : '❌ Failed');
    if (statsData.ok) {
      console.log('- Total calls:', statsData.data.calls);
      console.log('- Total transcripts:', statsData.data.transcripts);
      console.log('- Total analyses:', statsData.data.analyses);
    }
    
  } catch (error) {
    console.error('Config check failed:', error.message);
  }
}

// Run tests
console.log('🚀 Starting transcribe diagnostics...\n');
await checkConfig();
await testTranscribe();