#!/usr/bin/env node

/**
 * Import historical recordings from Convoso API
 * 
 * Usage:
 * 1. Set your Convoso auth token:
 *    export CONVOSO_AUTH_TOKEN=your-token-here
 * 
 * 2. Run for specific lead:
 *    node scripts/import-convoso-recordings.js --lead-id 12345
 * 
 * 3. Run for date range (gets all leads with recordings):
 *    node scripts/import-convoso-recordings.js --start "2024-01-01 00:00:00" --end "2024-12-31 23:59:59"
 */

const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;
const WEBHOOK_URL = 'https://synced-up-call-ai.vercel.app/api/hooks/convoso';
const WEBHOOK_SECRET = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

if (!CONVOSO_AUTH_TOKEN) {
  console.error('Error: CONVOSO_AUTH_TOKEN environment variable is required');
  console.error('Get your auth token from Convoso dashboard and set it:');
  console.error('export CONVOSO_AUTH_TOKEN=your-token-here');
  process.exit(1);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    leadId: null,
    startTime: null,
    endTime: null,
    offset: 0,
    limit: 100
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--lead-id':
        options.leadId = args[++i];
        break;
      case '--start':
        options.startTime = args[++i];
        break;
      case '--end':
        options.endTime = args[++i];
        break;
      case '--offset':
        options.offset = parseInt(args[++i]);
        break;
      case '--limit':
        options.limit = Math.min(100, parseInt(args[++i]));
        break;
    }
  }

  // Default date range if not specified
  if (!options.leadId && !options.startTime) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    options.startTime = thirtyDaysAgo.toISOString().replace('T', ' ').split('.')[0];
    options.endTime = now.toISOString().replace('T', ' ').split('.')[0];
    console.log(`No lead ID or date range specified. Using last 30 days.`);
  }

  return options;
}

/**
 * Fetch recordings from Convoso API
 */
async function fetchRecordings(options) {
  const params = new URLSearchParams({
    auth_token: CONVOSO_AUTH_TOKEN,
    offset: options.offset,
    limit: options.limit
  });

  if (options.leadId) {
    params.append('lead_id', options.leadId);
  }
  if (options.startTime) {
    params.append('start_time', options.startTime);
  }
  if (options.endTime) {
    params.append('end_time', options.endTime);
  }

  const url = `https://api.convoso.com/v1/lead/get-recordings?${params}`;
  
  console.log(`Fetching recordings from Convoso...`);
  if (options.leadId) {
    console.log(`Lead ID: ${options.leadId}`);
  } else {
    console.log(`Date range: ${options.startTime} to ${options.endTime}`);
  }

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.success) {
      throw new Error('Convoso API returned success: false');
    }

    return data.data;
  } catch (error) {
    console.error('Failed to fetch recordings:', error);
    throw error;
  }
}

/**
 * Build full recording URL
 * Note: You may need to adjust this based on your Convoso setup
 */
function buildRecordingUrl(recording) {
  // If URL is already complete, return it
  if (recording.url.startsWith('http')) {
    return recording.url;
  }
  
  // Otherwise, construct the full URL
  // You may need to adjust this base URL based on your Convoso instance
  const baseUrl = 'https://recordings.convoso.com';
  return `${baseUrl}/${recording.url}`;
}

/**
 * Transform Convoso recording to webhook format
 */
function transformRecording(recording) {
  // Calculate end time if not provided
  let endTime = recording.end_time;
  if (!endTime && recording.start_time && recording.seconds) {
    const startDate = new Date(recording.start_time);
    const endDate = new Date(startDate.getTime() + (recording.seconds * 1000));
    endTime = endDate.toISOString().replace('T', ' ').split('.')[0];
  }

  return {
    lead_id: `convoso-${recording.lead_id}`,
    call_id: `recording-${recording.recording_id}`,
    customer_phone: '+15555555555', // You'll need to get this from another API or set a default
    agent_id: 'historical-import',
    agent_name: 'Historical Import',
    disposition: 'Completed',
    campaign: 'Historical Import',
    direction: 'outbound',
    started_at: recording.start_time,
    ended_at: endTime,
    duration_sec: recording.seconds,
    recording_url: buildRecordingUrl(recording)
  };
}

/**
 * Send recording to webhook
 */
async function sendToWebhook(recordingData) {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
        'x-agency-id': 'convoso-import'
      },
      body: JSON.stringify(recordingData)
    });

    const result = await response.json().catch(() => null);
    
    if (response.ok && result?.ok) {
      return { success: true, callId: result.callId };
    } else {
      return { success: false, error: result?.error || response.statusText };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Main import function
 */
async function importRecordings() {
  const options = parseArgs();
  
  console.log('Starting Convoso recording import...');
  console.log('');

  try {
    // Fetch recordings
    const result = await fetchRecordings(options);
    console.log(`Found ${result.total} total recordings`);
    console.log(`Processing ${result.entries.length} recordings (offset: ${result.offset}, limit: ${result.limit})`);
    console.log('');

    if (result.entries.length === 0) {
      console.log('No recordings found for the specified criteria.');
      return;
    }

    // Process each recording
    let successCount = 0;
    let failCount = 0;
    
    for (const recording of result.entries) {
      console.log(`Processing recording ${recording.recording_id} for lead ${recording.lead_id}...`);
      
      // Transform to webhook format
      const transformed = transformRecording(recording);
      
      // Send to webhook
      const sendResult = await sendToWebhook(transformed);
      
      if (sendResult.success) {
        console.log(`✓ Imported successfully - Call ID: ${sendResult.callId}`);
        successCount++;
      } else {
        console.log(`✗ Failed to import: ${sendResult.error}`);
        failCount++;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('');
    console.log('Import complete!');
    console.log(`✓ Success: ${successCount} recordings`);
    console.log(`✗ Failed: ${failCount} recordings`);
    
    // Check if there are more recordings to process
    if (result.total > (result.offset + result.limit)) {
      console.log('');
      console.log(`Note: There are ${result.total - (result.offset + result.limit)} more recordings available.`);
      console.log(`Run again with --offset ${result.offset + result.limit} to continue.`);
    }
    
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

// Run if called directly
importRecordings()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });