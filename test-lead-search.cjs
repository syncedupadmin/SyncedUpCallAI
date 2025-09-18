// Use /leads/search to get full lead information
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

console.log('Testing Lead Search to Get Full Call Information');
console.log('=================================================\n');

// First, let's search by lead_id from our recordings
async function searchByLeadId(leadId) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      auth_token: AUTH_TOKEN,
      lead_id: leadId,
      limit: '1'
    }).toString();

    const options = {
      hostname: 'api.convoso.com',
      path: '/v1/leads/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
      }
    };

    console.log(`Searching for Lead ID: ${leadId}`);
    console.log('--------------------------------');

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (json.success === false) {
            console.log(`❌ Error: ${json.text || json.error || 'Unknown'}\n`);
            resolve(null);
          } else if (json.data && json.data.entries) {
            console.log(`✅ Found ${json.data.entries.length} lead(s)\n`);

            if (json.data.entries.length > 0) {
              const lead = json.data.entries[0];
              console.log('COMPLETE LEAD DATA:');
              console.log('===================');
              Object.keys(lead).forEach(key => {
                const value = lead[key];
                const displayValue = typeof value === 'string' && value.length > 80
                  ? value.substring(0, 80) + '...'
                  : value;
                console.log(`${key}: ${displayValue}`);
              });
              console.log('');
              resolve(lead);
            } else {
              resolve(null);
            }
          } else {
            console.log('Unexpected response structure\n');
            resolve(null);
          }
        } catch (e) {
          console.log(`❌ Error parsing response: ${e.message}\n`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ Request failed: ${e.message}\n`);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

// Also try a general search without specific lead_id
async function generalSearch() {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      auth_token: AUTH_TOKEN,
      offset: '0',
      limit: '5'
    }).toString();

    const options = {
      hostname: 'api.convoso.com',
      path: '/v1/leads/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length
      }
    };

    console.log('General Lead Search (last 5 leads)');
    console.log('-----------------------------------');

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (json.success === false) {
            console.log(`❌ Error: ${json.text || json.error || 'Unknown'}\n`);
          } else if (json.data && json.data.entries) {
            console.log(`✅ Found ${json.data.total} total leads`);
            console.log(`Showing ${json.data.entries.length} leads:\n`);

            json.data.entries.forEach((lead, i) => {
              console.log(`${i + 1}. Lead ID: ${lead.id || lead.lead_id}`);
              console.log(`   Name: ${lead.FirstName || lead.first_name || ''} ${lead.LastName || lead.last_name || ''}`);
              console.log(`   Phone: ${lead.PhoneNumber || lead.phone_number || 'N/A'}`);
              console.log(`   Email: ${lead.email || 'N/A'}`);
              console.log(`   Status: ${lead.status || 'N/A'}`);
              console.log(`   Campaign: ${lead.campaign || 'N/A'}`);
              console.log(`   Disposition: ${lead.disposition || 'N/A'}`);
              console.log('');
            });

            // Analyze available fields
            if (json.data.entries.length > 0) {
              console.log('═══════════════════════════════════════');
              console.log('AVAILABLE FIELDS IN LEAD DATA:');
              console.log('═══════════════════════════════════════');
              const sampleLead = json.data.entries[0];
              Object.keys(sampleLead).forEach(key => {
                console.log(`✓ ${key}`);
              });
            }
          } else {
            console.log('Unexpected response structure');
          }
        } catch (e) {
          console.log(`❌ Error parsing response: ${e.message}`);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ Request failed: ${e.message}`);
    });

    req.write(postData);
    req.end();
  });
}

// Run tests
async function runTests() {
  // Test with specific lead IDs from our recordings
  const testLeadIds = ['10427087', '10427097', '10427103'];

  for (const leadId of testLeadIds) {
    await searchByLeadId(leadId);
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between requests
  }

  // Then do a general search
  await generalSearch();

  console.log('\n═══════════════════════════════════════════════════');
  console.log('SUMMARY - COMBINING DATA:');
  console.log('═══════════════════════════════════════════════════');
  console.log('1. Use /leads/get-recordings with lead_id=0 to get recordings');
  console.log('2. For each recording, use lead_id to call /leads/search');
  console.log('3. Combine the data to get complete call information:');
  console.log('   - Recording data: recording_id, url, duration, timestamps');
  console.log('   - Lead data: customer name, phone, email, disposition, campaign');
  console.log('');
  console.log('This gives us ALL the information we need!');
}

runTests();