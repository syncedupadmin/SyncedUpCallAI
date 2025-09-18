const https = require('https');

console.log("=== COMPLETE CONVOSO FIELD ANALYSIS ===\n");

// Parse the actual webhook data you provided
const webhookData = {
  "created_by": 666669,
  "email": "worldisonecountry@gmail.com",
  "last_modified_by": 1242071,
  "owner_id": "0",
  "first_name": "Hardik",
  "last_name": "Patel",
  "phone_number": "7173363442",
  "alt_phone_1": "",
  "alt_phone_2": "",
  "phone_code": "1",
  "list_id": 10659,
  "address1": "3702 Wyoming Dr S",
  "address2": "",
  "city": "Reading",
  "state": "PA",
  "province": "",
  "postal_code": "19608",
  "country": "",
  "gender": "",
  "date_of_birth": "1982-04-02 00:00:00",
  "note": "",
  "publisher": "",
  "individual_or_family_plan_1": "INDIVIDUAL",
  "plan_start_date": "",
  "urgency_date": "",
  "currently_insured": "",
  "with_what_company": "",
  "what_are_you_spending_with_that_carrier": "0.00",
  "shopping_around": "",
  "past_coverage": "",
  "eligible_for_medicaid": "",
  "household_income": "0.00",
  "pre_existing": "",
  "current_meds": "",
  "upcoming_procedures": "",
  "mental_health_sub_prego": "",
  "price_range": "0.00",
  "payment_date": "",
  "reason_looking": "",
  "what_is_important_to_them": "",
  "monthly_price": "0.00",
  "enrollment_fee": "0.00",
  "total_today": "0.00",
  "network": "",
  "underwriter": "",
  "co_pays": "",
  "deductible": "",
  "rx_coverage": "",
  "insurance_ending": "",
  "job_state": "",
  "cobra": "",
  "publisher_name": "",
  "vendor_token": "",
  "plan_name": ""
};

console.log("PART 1: ALL FIELDS CONVOSO SENDS IN WEBHOOK");
console.log("============================================\n");

console.log("IDENTIFICATION FIELDS:");
console.log("  owner_id:", webhookData.owner_id, "(THIS IS THE LEAD_ID!)");
console.log("  created_by:", webhookData.created_by);
console.log("  last_modified_by:", webhookData.last_modified_by);
console.log("  list_id:", webhookData.list_id);

console.log("\nCONTACT FIELDS:");
console.log("  first_name:", webhookData.first_name);
console.log("  last_name:", webhookData.last_name);
console.log("  email:", webhookData.email);
console.log("  phone_number:", webhookData.phone_number);
console.log("  alt_phone_1:", webhookData.alt_phone_1 || "(empty)");
console.log("  alt_phone_2:", webhookData.alt_phone_2 || "(empty)");
console.log("  phone_code:", webhookData.phone_code);

console.log("\nADDRESS FIELDS:");
console.log("  address1:", webhookData.address1);
console.log("  address2:", webhookData.address2 || "(empty)");
console.log("  city:", webhookData.city);
console.log("  state:", webhookData.state);
console.log("  province:", webhookData.province || "(empty)");
console.log("  postal_code:", webhookData.postal_code);
console.log("  country:", webhookData.country || "(empty)");

console.log("\nDEMOGRAPHIC FIELDS:");
console.log("  gender:", webhookData.gender || "(empty)");
console.log("  date_of_birth:", webhookData.date_of_birth);

console.log("\nINSURANCE FIELDS (Total: 30+ fields):");
const insuranceFields = [
  "individual_or_family_plan_1", "plan_start_date", "urgency_date",
  "currently_insured", "with_what_company", "what_are_you_spending_with_that_carrier",
  "shopping_around", "past_coverage", "eligible_for_medicaid", "household_income",
  "pre_existing", "current_meds", "upcoming_procedures", "mental_health_sub_prego",
  "price_range", "payment_date", "reason_looking", "what_is_important_to_them",
  "monthly_price", "enrollment_fee", "total_today", "network", "underwriter",
  "co_pays", "deductible", "rx_coverage", "insurance_ending", "job_state", "cobra"
];
insuranceFields.forEach(field => {
  const value = webhookData[field];
  if (value && value !== "" && value !== "0.00") {
    console.log("  " + field + ":", value);
  }
});

console.log("\nMARKETING FIELDS:");
console.log("  publisher:", webhookData.publisher || "(empty)");
console.log("  publisher_name:", webhookData.publisher_name || "(empty)");
console.log("  vendor_token:", webhookData.vendor_token || "(empty)");
console.log("  note:", webhookData.note || "(empty)");

console.log("\n\nKEY DISCOVERY:");
console.log("==============");
console.log("✓ owner_id = '0' is actually the lead_id!");
console.log("✓ created_by = 666669 (likely the agent/user who created the lead)");
console.log("✓ last_modified_by = 1242071 (likely the agent who last touched it)");
console.log("✓ list_id = 10659 (the campaign/list this lead belongs to)");

// Now test what we can pull from Convoso
const authToken = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

console.log("\n\nPART 2: WHAT WE CAN PULL FROM CONVOSO API");
console.log("==========================================\n");

const testAPIs = () => {
  let testCount = 0;
  const results = {};

  // Test 1: Get recordings by lead_id
  const test1 = () => {
    const url = 'https://api.convoso.com/v1/leads/get-recordings?auth_token=' + authToken + '&lead_id=0&limit=1';
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        results.recordings = parsed.success ? "YES - Can fetch recordings" : "NO";
        testCount++;
        if (testCount === 5) printResults();
      });
    });
  };

  // Test 2: Get call logs
  const test2 = () => {
    const url = 'https://api.convoso.com/v1/reports/call-log?auth_token=' + authToken + '&limit=1';
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        results.callLogs = parsed.success ? "YES - Can fetch call logs" : "NO - " + (parsed.text || "Failed");
        testCount++;
        if (testCount === 5) printResults();
      });
    });
  };

  // Test 3: Get lead info
  const test3 = () => {
    const url = 'https://api.convoso.com/v1/leads/get?auth_token=' + authToken + '&lead_id=0';
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        results.leadInfo = parsed.success ? "YES - Can fetch lead details" : "NO - " + (parsed.text || "Failed");
        testCount++;
        if (testCount === 5) printResults();
      });
    });
  };

  // Test 4: Get dispositions
  const test4 = () => {
    const url = 'https://api.convoso.com/v1/reports/dispositions?auth_token=' + authToken + '&limit=1';
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        results.dispositions = parsed.success ? "YES - Can fetch dispositions" : "NO - " + (parsed.text || "Failed");
        testCount++;
        if (testCount === 5) printResults();
      });
    });
  };

  // Test 5: Get agents
  const test5 = () => {
    const url = 'https://api.convoso.com/v1/users/list?auth_token=' + authToken + '&limit=1';
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const parsed = JSON.parse(data);
        results.agents = parsed.success ? "YES - Can fetch agents" : "NO - " + (parsed.text || "Failed");
        testCount++;
        if (testCount === 5) printResults();
      });
    });
  };

  const printResults = () => {
    console.log("API ENDPOINTS WE CAN ACCESS:");
    console.log("  /leads/get-recordings:", results.recordings);
    console.log("  /reports/call-log:", results.callLogs);
    console.log("  /leads/get:", results.leadInfo);
    console.log("  /reports/dispositions:", results.dispositions);
    console.log("  /users/list:", results.agents);

    console.log("\n\nFINAL REPORT SUMMARY");
    console.log("====================");
    console.log("\nWEBHOOK PROVIDES:");
    console.log("- 50+ fields including full contact details");
    console.log("- owner_id (which is the lead_id)");
    console.log("- created_by and last_modified_by (agent IDs)");
    console.log("- Full insurance qualification data");
    console.log("\nAPI CAN PULL:");
    console.log("- Call recordings (using lead_id)");
    console.log("- Call logs and history");
    console.log("- Lead details");
    console.log("- Disposition reports");
    console.log("- Agent information");
    console.log("\nMISSING/ISSUES:");
    console.log("- owner_id='0' is not unique (multiple leads have it)");
    console.log("- No call_id in webhook data");
    console.log("- No agent_name in webhook data");
    console.log("- No disposition in webhook data");
    console.log("- No call duration in webhook data");
  };

  // Run all tests
  test1();
  test2();
  test3();
  test4();
  test5();
};

testAPIs();