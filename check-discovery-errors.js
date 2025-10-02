import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDiscoveryErrors() {
  console.log('Checking latest discovery session...\n');

  // Get latest session
  const { data: sessions, error: sessionError } = await supabase
    .from('discovery_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1);

  if (sessionError) {
    console.error('Error fetching session:', sessionError);
    return;
  }

  if (!sessions || sessions.length === 0) {
    console.log('No discovery sessions found');
    return;
  }

  const session = sessions[0];
  console.log('Latest Session:');
  console.log(`  ID: ${session.id}`);
  console.log(`  Agency: ${session.agency_id}`);
  console.log(`  Status: ${session.status}`);
  console.log(`  Total Calls: ${session.total_calls}`);
  console.log(`  Processed: ${session.processed}`);
  console.log(`  Progress: ${session.progress}%`);
  console.log(`  Error: ${session.error_message || 'None'}`);
  console.log(`  Started: ${session.started_at}`);
  console.log(`  Completed: ${session.completed_at || 'N/A'}\n`);

  // Get call status breakdown
  const { data: calls, error: callsError } = await supabase
    .from('discovery_calls')
    .select('processing_status, error_message')
    .eq('session_id', session.id);

  if (callsError) {
    console.error('Error fetching calls:', callsError);
    return;
  }

  const statusBreakdown = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0
  };

  const errorCounts = {};

  calls.forEach(call => {
    statusBreakdown[call.processing_status]++;

    if (call.processing_status === 'failed' && call.error_message) {
      // Group similar errors
      const errorKey = call.error_message.substring(0, 100);
      errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
    }
  });

  console.log('Call Status Breakdown:');
  console.log(`  Pending: ${statusBreakdown.pending}`);
  console.log(`  Processing: ${statusBreakdown.processing}`);
  console.log(`  Completed: ${statusBreakdown.completed}`);
  console.log(`  Failed: ${statusBreakdown.failed}\n`);

  if (Object.keys(errorCounts).length > 0) {
    console.log('Top Failure Reasons:');
    Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([error, count]) => {
        console.log(`  [${count}x] ${error}...`);
      });
  }

  // Get a sample failed call with full error
  const { data: failedSample } = await supabase
    .from('discovery_calls')
    .select('id, call_id, error_message, attempts')
    .eq('session_id', session.id)
    .eq('processing_status', 'failed')
    .limit(1);

  if (failedSample && failedSample.length > 0) {
    console.log('\nSample Failed Call:');
    console.log(`  Call ID: ${failedSample[0].call_id}`);
    console.log(`  Attempts: ${failedSample[0].attempts}`);
    console.log(`  Error: ${failedSample[0].error_message}`);
  }
}

checkDiscoveryErrors().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
