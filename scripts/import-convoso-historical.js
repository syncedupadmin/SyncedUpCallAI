#!/usr/bin/env node

/**
 * Import historical calls from Convoso API
 * 
 * Prerequisites:
 * - Get your Convoso API credentials
 * - Set environment variables:
 *   CONVOSO_API_KEY=your-api-key
 *   CONVOSO_API_URL=https://api.convoso.com/v1 (or your instance URL)
 *   WEBHOOK_URL=https://synced-up-call-ai.vercel.app/api/hooks/convoso
 *   WEBHOOK_SECRET=8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p
 */

const CONVOSO_API_KEY = process.env.CONVOSO_API_KEY;
const CONVOSO_API_URL = process.env.CONVOSO_API_URL || 'https://api.convoso.com/v1';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://synced-up-call-ai.vercel.app/api/hooks/convoso';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

if (!CONVOSO_API_KEY) {
  console.error('Error: CONVOSO_API_KEY environment variable is required');
  console.error('Please set it with your Convoso API key');
  process.exit(1);
}

/**
 * Fetch historical calls from Convoso
 * Note: This is a template - adjust the endpoint and parameters based on Convoso's actual API
 */
async function fetchConvosoCalls(startDate, endDate) {
  console.log(`Fetching calls from ${startDate} to ${endDate}...`);
  
  // This is a template - replace with actual Convoso API endpoint
  // Check Convoso documentation for the correct endpoint
  const url = `${CONVOSO_API_URL}/calls?start_date=${startDate}&end_date=${endDate}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CONVOSO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Convoso API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.calls || data; // Adjust based on actual response structure
  } catch (error) {
    console.error('Failed to fetch from Convoso:', error);
    throw error;
  }
}

/**
 * Transform Convoso call data to match webhook format
 */
function transformCall(convosoCall) {
  // Adjust field mappings based on actual Convoso API response
  return {
    lead_id: convosoCall.lead_id || convosoCall.id,
    customer_phone: convosoCall.customer_phone || convosoCall.phone,
    agent_id: convosoCall.agent_id || convosoCall.agent?.id,
    agent_name: convosoCall.agent_name || convosoCall.agent?.name,
    disposition: convosoCall.disposition || convosoCall.status,
    campaign: convosoCall.campaign || convosoCall.campaign_name,
    direction: convosoCall.direction || 'outbound',
    started_at: convosoCall.started_at || convosoCall.start_time,
    ended_at: convosoCall.ended_at || convosoCall.end_time,
    recording_url: convosoCall.recording_url || convosoCall.recording,
    sale_time: convosoCall.sale_time || null
  };
}

/**
 * Send call to webhook
 */
async function sendToWebhook(callData, agencyId = 'historical-import') {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
        'x-agency-id': agencyId
      },
      body: JSON.stringify(callData)
    });

    const result = await response.json().catch(() => null);
    
    if (response.ok && result?.ok) {
      console.log(`✓ Imported call ${callData.lead_id} - Call ID: ${result.callId}`);
      return { success: true, callId: result.callId };
    } else {
      console.error(`✗ Failed to import ${callData.lead_id}:`, result?.error || response.statusText);
      return { success: false, error: result?.error || response.statusText };
    }
  } catch (error) {
    console.error(`✗ Failed to import ${callData.lead_id}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main import function
 */
async function importHistoricalCalls() {
  // Set date range (adjust as needed)
  const endDate = new Date().toISOString().split('T')[0]; // Today
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days ago
  
  console.log('Starting Convoso historical import...');
  console.log(`Date range: ${startDate} to ${endDate}`);
  console.log('');

  try {
    // Fetch calls from Convoso
    const calls = await fetchConvosoCalls(startDate, endDate);
    console.log(`Found ${calls.length} calls to import`);
    console.log('');

    // Process each call
    let successCount = 0;
    let failCount = 0;
    
    for (const call of calls) {
      // Transform to webhook format
      const transformedCall = transformCall(call);
      
      // Skip calls without recording URLs
      if (!transformedCall.recording_url) {
        console.log(`⊘ Skipping ${transformedCall.lead_id} - no recording URL`);
        continue;
      }
      
      // Send to webhook
      const result = await sendToWebhook(transformedCall);
      
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Rate limiting - adjust as needed
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('');
    console.log('Import complete!');
    console.log(`✓ Success: ${successCount} calls`);
    console.log(`✗ Failed: ${failCount} calls`);
    
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  importHistoricalCalls()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { fetchConvosoCalls, transformCall, sendToWebhook };