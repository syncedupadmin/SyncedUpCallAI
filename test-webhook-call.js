// Test script to send a test call webhook
const testCallWebhook = async () => {
  const testCall = {
    call_id: `test-${Date.now()}`,
    lead_id: "test-lead-123",
    agent_name: "Test Agent",
    phone_number: "555-0123",
    disposition: "SOLD",
    duration: 180,
    campaign: "Test Campaign",
    recording_url: "https://example.com/test-recording.mp3",
    started_at: new Date(Date.now() - 180000).toISOString(),
    ended_at: new Date().toISOString()
  };

  console.log('Sending test call webhook:', testCall);

  try {
    const response = await fetch('http://localhost:3000/api/webhooks/convoso-calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testCall)
    });

    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Response body:', result);

    if (response.ok) {
      console.log('✅ Webhook succeeded!');
      console.log('Call ID:', result.call?.id);
    } else {
      console.error('❌ Webhook failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
};

testCallWebhook();