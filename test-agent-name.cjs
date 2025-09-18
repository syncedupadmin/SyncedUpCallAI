// Test to verify agent names are coming through correctly
const https = require('https');

const CONVOSO_API_BASE = 'https://api.convoso.com/v1';
const CONVOSO_AUTH_TOKEN = '2b07c5c0-b873-11ef-b248-fb7bb08c79de';

// First get a recording
function getRecordings() {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN,
      lead_id: '0',
      date_from: '2025-09-17',
      date_to: '2025-09-18',
      limit: '1'
    });

    const url = `${CONVOSO_API_BASE}/leads/get-recordings?${params}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Then get lead data for that recording
function getLeadData(leadId) {
  return new Promise((resolve, reject) => {
    const formData = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN,
      lead_id: leadId,
      limit: '1'
    });

    const options = {
      hostname: 'api.convoso.com',
      path: '/v1/leads/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': formData.toString().length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(formData.toString());
    req.end();
  });
}

async function testAgentNames() {
  console.log('🔍 Testing Agent Name Retrieval\n');
  console.log('================================\n');

  try {
    // Step 1: Get recordings
    console.log('Step 1: Fetching recordings...');
    const recordings = await getRecordings();

    if (!recordings.data || recordings.data.length === 0) {
      console.log('❌ No recordings found');
      return;
    }

    const recording = recordings.data[0];
    console.log(`✅ Found recording: ${recording.recording_id}`);
    console.log(`   Lead ID: ${recording.lead_id}`);
    console.log(`   Duration: ${recording.seconds}s\n`);

    // Step 2: Get lead data
    console.log('Step 2: Fetching lead data...');
    const leadData = await getLeadData(recording.lead_id);

    if (!leadData.data || !leadData.data.entries || leadData.data.entries.length === 0) {
      console.log('❌ No lead data found');
      return;
    }

    const lead = leadData.data.entries[0];
    console.log('✅ Lead data found:\n');
    console.log('   Customer:', lead.first_name, lead.last_name);
    console.log('   Phone:', lead.phone_number);
    console.log('   Campaign:', lead.campaign_name);
    console.log('   List:', lead.directory_name || lead.list_id);
    console.log('   Disposition:', lead.status_name || lead.status);
    console.log('\n🎯 AGENT INFORMATION:');
    console.log('   user_id:', lead.user_id);
    console.log('   user_name:', lead.user_name);
    console.log('   agent:', lead.agent);
    console.log('   agent_name:', lead.agent_name);
    console.log('   assigned_user:', lead.assigned_user);

    console.log('\n📋 All available fields:');
    Object.keys(lead).forEach(key => {
      if (key.toLowerCase().includes('user') || key.toLowerCase().includes('agent')) {
        console.log(`   ${key}: ${lead[key]}`);
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAgentNames();