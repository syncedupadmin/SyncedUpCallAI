require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sessionId = '50ce6b7b-6b80-410c-b0b1-2e174dfab01e';

(async () => {
  console.log(`Checking session ${sessionId}...\n`);

  const { data, error } = await supabase
    .from('discovery_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('=== SESSION ===');
  console.log('Status:', data.status);
  console.log('Progress:', data.progress + '%');
  console.log('Total calls:', data.total_calls);
  console.log('Processed:', data.processed);
  console.log('Started:', data.started_at);
  console.log('Error:', data.error_message || 'none');

  // Check discovery_calls counts
  const { count: pending } = await supabase
    .from('discovery_calls')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('processing_status', 'pending');

  const { count: processing } = await supabase
    .from('discovery_calls')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('processing_status', 'processing');

  const { count: completed } = await supabase
    .from('discovery_calls')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('processing_status', 'completed');

  const { count: failed } = await supabase
    .from('discovery_calls')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('processing_status', 'failed');

  console.log('\n=== CALLS BREAKDOWN ===');
  console.log('Pending:', pending);
  console.log('Processing:', processing);
  console.log('Completed:', completed);
  console.log('Failed:', failed);
  console.log('Total:', (pending || 0) + (processing || 0) + (completed || 0) + (failed || 0));

  // Get sample of failed calls
  if (failed > 0) {
    const { data: failedCalls } = await supabase
      .from('discovery_calls')
      .select('call_id, error_message')
      .eq('session_id', sessionId)
      .eq('processing_status', 'failed')
      .limit(5);

    console.log('\n=== SAMPLE FAILURES ===');
    failedCalls?.forEach(c => {
      console.log(`Call ${c.call_id}: ${c.error_message}`);
    });
  }

  // Get sample of pending calls
  if (pending > 0) {
    const { data: pendingCalls } = await supabase
      .from('discovery_calls')
      .select('call_id, recording_url')
      .eq('session_id', sessionId)
      .eq('processing_status', 'pending')
      .limit(3);

    console.log('\n=== SAMPLE PENDING ===');
    pendingCalls?.forEach(c => {
      console.log(`Call ${c.call_id}: ${c.recording_url ? 'has recording URL' : 'NO RECORDING URL'}`);
    });
  }
})();
