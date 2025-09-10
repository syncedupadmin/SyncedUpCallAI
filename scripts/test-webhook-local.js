#!/usr/bin/env node

/**
 * Test the Convoso webhook with sample data
 * This simulates what Convoso will send to your webhook
 */

const WEBHOOK_URL = 'https://synced-up-call-ai.vercel.app/api/hooks/convoso';
const WEBHOOK_SECRET = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Sample call data - this is what Convoso will send
const sampleCall = {
  lead_id: `test-${Date.now()}`,
  call_id: `call-${Date.now()}`,
  customer_phone: '+15551234567',
  agent_id: 'agent-001',
  agent_name: 'Test Agent',
  disposition: 'Sale',
  campaign: 'Test Campaign',
  direction: 'outbound',
  started_at: new Date(Date.now() - 300000).toISOString().replace('T', ' ').split('.')[0], // 5 mins ago
  ended_at: new Date().toISOString().replace('T', ' ').split('.')[0], // now
  duration_sec: 300,
  recording_url: 'https://example.com/recording.mp3'
};

async function testWebhook() {
  console.log('Testing Convoso webhook...');
  console.log('URL:', WEBHOOK_URL);
  console.log('');
  console.log('Sending sample call data:');
  console.log(JSON.stringify(sampleCall, null, 2));
  console.log('');

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
        'x-agency-id': 'test-agency'
      },
      body: JSON.stringify(sampleCall)
    });

    const result = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(result, null, 2));
    
    if (response.ok && result.ok) {
      console.log('');
      console.log('✅ Webhook is working correctly!');
      console.log(`Call ID created: ${result.callId}`);
      console.log('');
      console.log('Next steps:');
      console.log('1. In Convoso, configure the webhook URL to:', WEBHOOK_URL);
      console.log('2. Set the webhook secret to:', WEBHOOK_SECRET);
      console.log('3. Convoso will send call data to this endpoint when calls complete');
    } else {
      console.log('');
      console.log('❌ Webhook test failed');
      if (result.error) {
        console.log('Error:', result.error);
      }
    }
  } catch (error) {
    console.error('Failed to test webhook:', error.message);
  }
}

testWebhook().catch(console.error);