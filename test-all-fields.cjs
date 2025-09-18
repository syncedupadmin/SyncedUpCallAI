// Test to see ALL fields returned by Convoso API
const https = require('https');

const CONVOSO_API_BASE = 'https://api.convoso.com/v1';
const CONVOSO_AUTH_TOKEN = '2b07c5c0-b873-11ef-b248-fb7bb08c79de';

// Get lead data and show ALL fields
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

async function testFields() {
  console.log('🔍 Checking ALL fields from Convoso API\n');
  console.log('========================================\n');

  // Test with one of the lead IDs from your data
  const testLeadIds = ['6015411752', '6466562941', '0'];

  for (const leadId of testLeadIds) {
    console.log(`\nTesting Lead ID: ${leadId}`);
    console.log('------------------------');

    try {
      const leadData = await getLeadData(leadId);

      if (!leadData.data || !leadData.data.entries || leadData.data.entries.length === 0) {
        console.log('❌ No lead data found');
        continue;
      }

      const lead = leadData.data.entries[0];
      console.log('✅ Lead data found\n');

      // Show ALL fields
      console.log('ALL FIELDS:');
      Object.keys(lead).forEach(key => {
        const value = lead[key];
        // Highlight agent/user related fields
        if (key.toLowerCase().includes('user') || key.toLowerCase().includes('agent')) {
          console.log(`  🎯 ${key}: "${value}"`);
        } else {
          console.log(`     ${key}: "${value}"`);
        }
      });

      break; // Just test one successful lead
    } catch (error) {
      console.error(`❌ Error for lead ${leadId}:`, error.message);
    }
  }
}

testFields();