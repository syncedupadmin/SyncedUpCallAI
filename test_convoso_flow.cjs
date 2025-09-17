const https = require('https');

console.log("=== CONVOSO DATA FLOW TEST REPORT ===\n");

// Test 1: Simulate what Convoso sends to webhook
console.log("TEST 1: What Convoso Sends to Webhook");
console.log("----------------------------------------");
const sampleWebhookData = {
  lead_id: "0",
  phone_number: "7173363442", 
  first_name: "Hardik",
  last_name: "Patel",
  email: "worldisonecountry@gmail.com",
  // Other possible fields Convoso might send
  id: null,
  owner_id: null,
  created_by: null
};

console.log("Sample webhook payload received:");
console.log(JSON.stringify(sampleWebhookData, null, 2));
console.log("\nPROBLEM: lead_id is '0' which is not a valid Convoso lead ID\n");

// Test 2: Try to fetch recording with lead_id = "0"
console.log("\nTEST 2: Fetch Recording with lead_id='0'");
console.log("----------------------------------------");

const authToken = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';
const testWithInvalidLeadId = () => {
  const url = 'https://api.convoso.com/v1/leads/get-recordings?auth_token=' + authToken + '&lead_id=0&limit=1';
  
  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('API Response for lead_id=0:');
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
      
      if (!parsed.success) {
        console.log("\nRESULT: Cannot fetch recordings - lead_id '0' doesn't exist in Convoso\n");
      }
      
      // Test 3: Check what fields we can use
      testAlternativeApproaches();
    });
  }).on('error', (err) => {
    console.error('Error:', err.message);
  });
};

// Test 3: Alternative approaches
const testAlternativeApproaches = () => {
  console.log("\nTEST 3: Alternative Approaches");
  console.log("----------------------------------------");
  
  // Try without lead_id (get all recent recordings)
  const url = 'https://api.convoso.com/v1/leads/get-recordings?auth_token=' + authToken + '&limit=2';
  
  console.log("Fetching recent recordings to see data structure...");
  
  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      const parsed = JSON.parse(data);
      
      if (parsed.success && parsed.data && parsed.data.entries && parsed.data.entries.length > 0) {
        console.log("\nSample Recording Entry Structure:");
        const firstEntry = parsed.data.entries[0];
        console.log(JSON.stringify(firstEntry, null, 2));
        
        console.log("\n=== KEY FINDINGS ===");
        console.log("1. Real lead_ids in Convoso look like:", firstEntry.lead_id || "Field not found");
        console.log("2. Available fields for matching:", Object.keys(firstEntry).join(', '));
        console.log("3. Phone number format:", firstEntry.phone || firstEntry.phone_number || "Not found");
        
        generateReport(sampleWebhookData, firstEntry);
      } else {
        console.log("No recordings found or API error:", JSON.stringify(parsed, null, 2));
        generateReport(sampleWebhookData, null);
      }
    });
  }).on('error', (err) => {
    console.error('Error:', err.message);
  });
};

// Generate final report
const generateReport = (webhookData, recordingData) => {
  console.log("\n\n=== FINAL REPORT ===");
  console.log("====================\n");
  
  console.log("PROBLEM SUMMARY:");
  console.log("- Webhook receives lead_id='0' (invalid)");
  console.log("- Recording fetch fails because '0' doesn't exist in Convoso");
  console.log("- System cannot match webhook data to recordings\n");
  
  console.log("DATA MISMATCH:");
  console.log("Webhook provides:");
  console.log("  lead_id: '" + webhookData.lead_id + "'");
  console.log("  phone: " + webhookData.phone_number);
  
  if (recordingData) {
    console.log("\nConvoso recordings have:");
    console.log("  lead_id: " + (recordingData.lead_id || "unknown"));
    console.log("  phone: " + (recordingData.phone || recordingData.phone_number || "unknown"));
  }
  
  console.log("\nPOSSIBLE SOLUTIONS:");
  console.log("1. Convoso needs to send the actual lead_id in webhooks");
  console.log("2. Use phone number as primary matching key instead of lead_id");
  console.log("3. Wait for call webhook which might have the real lead_id");
  console.log("4. Query Convoso API by phone to find the real lead_id");
  
  console.log("\n=== END REPORT ===");
};

// Start tests
testWithInvalidLeadId();
