// Create a test call in the database for testing transcription
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTestCall() {
  console.log('Creating Test Call in Database');
  console.log('================================\n');

  // Create a test call with a sample recording URL
  const testCall = {
    call_id: `test_call_${Date.now()}`,
    convoso_lead_id: '12345678',
    agent_name: 'Test Agent',
    agent_email: 'test@example.com',
    disposition: 'SALE',
    duration: 180, // 3 minutes
    phone_number: '555-0123',
    recording_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Public test audio
    campaign: 'Test Campaign',
    started_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    ended_at: new Date(Date.now() - 3420000).toISOString(), // 57 minutes ago
    office_id: 1,
    talk_time_sec: 160,
    source: 'test_manual',
    metadata: {
      test: true,
      created_by: 'manual_test',
      purpose: 'testing transcription pipeline'
    }
  };

  try {
    // Insert the call
    const { data, error } = await supabase
      .from('calls')
      .insert(testCall)
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating call:', error);
      return;
    }

    console.log('✅ Test call created successfully!');
    console.log('\nCall Details:');
    console.log('=============');
    console.log('Database ID:', data.id);
    console.log('Call ID:', data.call_id);
    console.log('Lead ID:', data.convoso_lead_id);
    console.log('Agent:', data.agent_name);
    console.log('Duration:', data.duration, 'seconds');
    console.log('Recording URL:', data.recording_url);

    // Queue for transcription
    console.log('\nQueuing for transcription...');

    const { data: queueData, error: queueError } = await supabase
      .from('transcription_queue')
      .insert({
        call_id: data.id,
        status: 'pending',
        priority: 1,
        metadata: {
          test: true,
          manual_queue: true
        }
      })
      .select()
      .single();

    if (queueError) {
      console.error('❌ Error queuing transcription:', queueError);
    } else {
      console.log('✅ Queued for transcription!');
      console.log('Queue ID:', queueData.id);
      console.log('Status:', queueData.status);
    }

    console.log('\n📝 Next Steps:');
    console.log('1. Check the super admin portal to see the call');
    console.log('2. Run transcription processor to transcribe');
    console.log('3. Check analysis results');

    return data;

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

createTestCall();