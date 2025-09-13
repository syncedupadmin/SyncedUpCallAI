// Use native fetch (available in Node 18+)

// Simulate a Convoso webhook with call data
const testWebhook = async () => {
  const webhookUrl = 'https://synced-up-call-ai.vercel.app/api/webhooks/convoso';
  
  // Create realistic call data based on the MP3 filename
  // Filename: 103833_1110461_8133265050_10307113_4123_1757508132_0984.mp3
  const callData = {
    // Call identification
    call_id: '103833-' + Date.now(),
    convoso_call_id: '103833',
    CallID: '103833',
    
    // Lead/Contact info
    lead_id: '1110461',
    phone_number: '8133265050',
    customer_phone: '8133265050',
    
    // Agent info
    agent_id: '10307113',
    agent_name: 'Test Agent',
    user: 'Test Agent',
    
    // Call details
    campaign: 'Test Campaign',
    campaign_name: 'Test Campaign',
    disposition: 'Completed',
    call_disposition: 'Completed',
    direction: 'outbound',
    
    // Timing (simulate a 2-minute call)
    started_at: new Date(Date.now() - 120000).toISOString(),
    ended_at: new Date().toISOString(),
    duration: 120,
    duration_sec: 120,
    
    // Recording URL - you could host this MP3 somewhere or use a placeholder
    recording_url: 'https://example.com/recordings/103833_test.mp3',
    
    // Additional fields
    notes: 'Test call with local MP3 file',
    timestamp: new Date().toISOString()
  };
  
  console.log('Sending test webhook to:', webhookUrl);
  console.log('Call data:', JSON.stringify(callData, null, 2));
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Convoso-Webhook-Test'
      },
      body: JSON.stringify(callData)
    });
    
    const result = await response.json();
    console.log('\n✅ Webhook response:', result);
    
    if (result.ok) {
      console.log('\n📊 Check your dashboard at: https://synced-up-call-ai.vercel.app/dashboard');
      console.log('The new call should appear in the Recent Calls section');
      
      // Also check if we can retrieve the call
      const callsResponse = await fetch('https://synced-up-call-ai.vercel.app/api/ui/calls?limit=1');
      const callsData = await callsResponse.json();
      
      if (callsData.ok && callsData.data.length > 0) {
        console.log('\n📞 Most recent call in database:');
        console.log('- ID:', callsData.data[0].id);
        console.log('- Started:', callsData.data[0].started_at);
        console.log('- Duration:', callsData.data[0].duration_sec, 'seconds');
        console.log('- Disposition:', callsData.data[0].disposition);
      }
    }
    
  } catch (error) {
    console.error('❌ Error sending webhook:', error.message);
  }
};

// Test with multiple call scenarios
const testMultipleCalls = async () => {
  console.log('🧪 Testing multiple call scenarios...\n');
  
  const scenarios = [
    {
      disposition: 'Completed',
      duration: 180,
      agent_name: 'John Smith',
      campaign: 'Sales Campaign'
    },
    {
      disposition: 'No Answer',
      duration: 15,
      agent_name: 'Jane Doe',
      campaign: 'Follow-up Campaign'
    },
    {
      disposition: 'Voicemail',
      duration: 45,
      agent_name: 'Bob Johnson',
      campaign: 'Outreach Campaign'
    }
  ];
  
  for (const [index, scenario] of scenarios.entries()) {
    const callData = {
      call_id: `test-${Date.now()}-${index}`,
      lead_id: `lead-${1000 + index}`,
      phone_number: `813326${5050 + index}`,
      agent_id: `agent-${100 + index}`,
      agent_name: scenario.agent_name,
      campaign: scenario.campaign,
      disposition: scenario.disposition,
      direction: 'outbound',
      started_at: new Date(Date.now() - (scenario.duration * 1000)).toISOString(),
      ended_at: new Date().toISOString(),
      duration_sec: scenario.duration,
      recording_url: `https://example.com/test-recording-${index}.mp3`
    };
    
    console.log(`Sending call ${index + 1}/${scenarios.length}: ${scenario.disposition} - ${scenario.duration}s`);
    
    const response = await fetch('https://synced-up-call-ai.vercel.app/api/webhooks/convoso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callData)
    });
    
    const result = await response.json();
    console.log(`Response: ${result.ok ? '✅ Success' : '❌ Failed'}`);
    
    // Wait a bit between calls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✅ All test calls sent!');
  console.log('📊 Check dashboard: https://synced-up-call-ai.vercel.app/dashboard');
};

// Run the test
console.log('🚀 Starting Convoso webhook test...\n');
console.log('Choose test mode:');
console.log('1. Single call test');
console.log('2. Multiple calls test');
console.log('\nRunning single call test...\n');

testWebhook();