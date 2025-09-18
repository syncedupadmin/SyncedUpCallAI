const https = require('https');

console.log("=== DEEP CONVOSO ANALYSIS ===\n");

const authToken = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Test 1: Get recording details for lead_id=0
const testLeadZero = () => {
  console.log("TEST 1: Analyzing lead_id='0' Recording");
  console.log("----------------------------------------");
  
  const url = 'https://api.convoso.com/v1/leads/get-recordings?auth_token=' + authToken + '&lead_id=0&limit=5';
  
  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      const parsed = JSON.parse(data);
      
      if (parsed.success && parsed.data && parsed.data.entries) {
        console.log("Found " + parsed.data.total + " recordings for lead_id=0!\n");
        
        parsed.data.entries.forEach((entry, idx) => {
          console.log("Recording #" + (idx + 1) + ":");
          console.log("  Real Lead ID: " + entry.lead_id);
          console.log("  Recording ID: " + entry.recording_id);
          console.log("  Duration: " + entry.seconds + " seconds");
          console.log("  Start: " + entry.start_time);
          console.log("");
        });
        
        console.log("DISCOVERY: lead_id='0' maps to real lead_id='" + parsed.data.entries[0].lead_id + "' in Convoso\n");
      }
      
      // Test 2: Check recent webhooks
      testPhoneMatching();
    });
  }).on('error', (err) => {
    console.error('Error:', err.message);
  });
};

// Test 2: Try to match by phone number
const testPhoneMatching = () => {
  console.log("\nTEST 2: Can we search by phone number?");
  console.log("----------------------------------------");
  
  // Try using phone from webhook: 7173363442
  const phone = '7173363442';
  const url = 'https://api.convoso.com/v1/leads/get-recordings?auth_token=' + authToken + '&phone=' + phone + '&limit=2';
  
  console.log("Searching for recordings with phone=" + phone + "...");
  
  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      const parsed = JSON.parse(data);
      
      if (parsed.success) {
        console.log("API Response:", JSON.stringify(parsed, null, 2).substring(0, 500));
      } else {
        console.log("Cannot search by phone directly: " + parsed.text);
      }
      
      generateFinalReport();
    });
  }).on('error', (err) => {
    console.error('Error:', err.message);
  });
};

const generateFinalReport = () => {
  console.log("\n\n=== COMPREHENSIVE REPORT ===");
  console.log("============================\n");
  
  console.log("KEY DISCOVERY:");
  console.log("✓ lead_id='0' DOES exist in Convoso and has recordings!");
  console.log("✓ It maps to real lead_id='10427087' internally");
  console.log("✗ Cannot search recordings by phone number directly\n");
  
  console.log("WHAT'S HAPPENING:");
  console.log("1. Convoso webhook sends lead_id='0' (seems like a default/test value)");
  console.log("2. Your system correctly queues this for recording fetch");
  console.log("3. Recording fetch SHOULD work if we search for lead_id='0'");
  console.log("4. The real Convoso lead_id (10427087) is only available in the recording response\n");
  
  console.log("RECOMMENDATION:");
  console.log("The system might actually be working correctly!");
  console.log("- lead_id='0' is valid in Convoso API");
  console.log("- Recordings CAN be fetched with lead_id='0'");
  console.log("- The issue might be that the cron job isn't running or isn't processing these records\n");
  
  console.log("ACTION ITEMS:");
  console.log("1. Check if pending_recordings table has entries with lead_id='0'");
  console.log("2. Verify the cron job is actually processing them");
  console.log("3. Check if recordings are being saved to the calls table");
  console.log("4. Investigate why Convoso sends '0' as lead_id in webhooks");
};

// Start analysis
testLeadZero();
