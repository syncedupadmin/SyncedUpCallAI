// Show ALL data fields that come with each recording
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Get recent recordings
const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

console.log('Analyzing Full Recording Data Structure');
console.log('=======================================');
console.log('Fetching recordings from:', formatDate(yesterday), 'to', formatDate(now));
console.log('');

const params = new URLSearchParams({
  auth_token: AUTH_TOKEN,
  lead_id: '0',  // Get ALL recordings
  date_from: formatDate(yesterday),
  date_to: formatDate(now),
  limit: '5'  // Just get a few to analyze
});

const url = `https://api.convoso.com/v1/leads/get-recordings?${params.toString()}`;

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.log('❌ HTTP Error:', res.statusCode);
      return;
    }

    try {
      const json = JSON.parse(data);

      if (json.data && json.data.entries && json.data.entries.length > 0) {
        const recordings = json.data.entries;

        console.log(`✅ Found ${recordings.length} recordings\n`);
        console.log('═══════════════════════════════════════════════════');
        console.log('COMPLETE DATA FOR EACH RECORDING:');
        console.log('═══════════════════════════════════════════════════\n');

        // Show first recording with ALL fields
        const rec = recordings[0];

        console.log('RECORDING #1 - ALL AVAILABLE FIELDS:');
        console.log('=====================================');

        // Show each field and its value
        Object.keys(rec).forEach(key => {
          const value = rec[key];
          const displayValue = typeof value === 'string' && value.length > 100
            ? value.substring(0, 100) + '...'
            : value;

          console.log(`📌 ${key}: ${displayValue}`);
        });

        console.log('\n═══════════════════════════════════════════════════');
        console.log('FIELD ANALYSIS:');
        console.log('═══════════════════════════════════════════════════\n');

        // Analyze what fields are available
        const allFields = new Set();
        const alwaysPresent = [];
        const sometimesPresent = [];

        // Check which fields are in all recordings
        recordings.forEach(r => {
          Object.keys(r).forEach(key => allFields.add(key));
        });

        // Check consistency
        allFields.forEach(field => {
          const count = recordings.filter(r => r[field] !== null && r[field] !== undefined).length;
          if (count === recordings.length) {
            alwaysPresent.push(field);
          } else {
            sometimesPresent.push(`${field} (${count}/${recordings.length})`);
          }
        });

        console.log('✅ ALWAYS PRESENT FIELDS:');
        alwaysPresent.forEach(field => console.log(`   - ${field}`));

        if (sometimesPresent.length > 0) {
          console.log('\n⚠️ SOMETIMES PRESENT FIELDS:');
          sometimesPresent.forEach(field => console.log(`   - ${field}`));
        }

        console.log('\n═══════════════════════════════════════════════════');
        console.log('DATA MAPPING FOR OUR DATABASE:');
        console.log('═══════════════════════════════════════════════════\n');

        console.log('Convoso Field → Our Database Field:');
        console.log('-----------------------------------');
        console.log('recording_id → call_id (prefixed with "convoso_")');
        console.log('lead_id → convoso_lead_id');
        console.log('start_time → started_at');
        console.log('end_time → ended_at');
        console.log('seconds → duration');
        console.log('url → recording_url');

        console.log('\n❓ MISSING DATA (not in this endpoint):');
        console.log('---------------------------------------');
        console.log('- Agent name (agent_name)');
        console.log('- Customer name (first_name, last_name)');
        console.log('- Phone number (phone_number)');
        console.log('- Disposition (disposition)');
        console.log('- Campaign (campaign)');
        console.log('- Email (email)');

        console.log('\n💡 IMPORTANT NOTES:');
        console.log('------------------');
        console.log('1. This endpoint only returns recording data');
        console.log('2. To get full call details (agent, customer, etc), need different endpoint');
        console.log('3. All recordings have URLs for playback');
        console.log('4. Duration is in seconds (decimal format)');
        console.log('5. Times are in YYYY-MM-DD HH:MM:SS format');

        // Show sample URL structure
        if (rec.url) {
          console.log('\n🔗 RECORDING URL STRUCTURE:');
          console.log('---------------------------');
          const urlParts = rec.url.split('/');
          console.log('Base:', urlParts.slice(0, 3).join('/'));
          console.log('Path:', urlParts.slice(3, -1).join('/'));
          console.log('Token:', urlParts[urlParts.length - 1].substring(0, 20) + '...');
        }

      } else {
        console.log('No recordings found');
      }
    } catch (e) {
      console.log('❌ Error:', e.message);
    }
  });
}).on('error', console.error);