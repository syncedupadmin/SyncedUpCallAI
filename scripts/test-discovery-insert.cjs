require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing Supabase credentials');
  console.log('SUPABASE_URL:', SUPABASE_URL ? 'set' : 'NOT SET');
  console.log('SERVICE_KEY:', SERVICE_KEY ? 'set' : 'NOT SET');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const testSessionId = '00000000-0000-0000-0000-000000000001'; // Test UUID

async function testInsert() {
  console.log('Testing discovery_calls insert...\n');

  // Create a test session first
  console.log('Step 1: Creating test session...');
  const { error: sessionError } = await supabase
    .from('discovery_sessions')
    .upsert({
      id: testSessionId,
      agency_id: null, // Will fail if agency_id is NOT NULL
      status: 'initializing',
      total_calls: 1,
      progress: 0,
      processed: 0
    });

  if (sessionError) {
    console.error('❌ Session insert failed:', sessionError);
    return;
  }
  console.log('✓ Session created\n');

  // Test inserting a call
  console.log('Step 2: Inserting test call...');
  const testCall = {
    session_id: testSessionId,
    call_id: 'TEST_CALL_123',
    lead_id: 'TEST_LEAD_456',
    user_id: '1222196',
    user_name: '313 ----ERNEST----',
    campaign: 'Test Campaign',
    status: 'NOCON',
    call_length: 377,
    call_type: 'INBOUND',
    started_at: new Date().toISOString(),
    recording_url: 'https://example.com/recording.wav',
    processing_status: 'pending'
  };

  const { data, error } = await supabase
    .from('discovery_calls')
    .insert(testCall)
    .select();

  if (error) {
    console.error('❌ Call insert FAILED:');
    console.error('  Code:', error.code);
    console.error('  Message:', error.message);
    console.error('  Details:', error.details);
    console.error('  Hint:', error.hint);
  } else {
    console.log('✓ Call inserted successfully:', data);
  }

  // Cleanup
  console.log('\nStep 3: Cleanup...');
  await supabase.from('discovery_sessions').delete().eq('id', testSessionId);
  console.log('✓ Cleanup complete');
}

testInsert().catch(err => console.error('Unexpected error:', err));
