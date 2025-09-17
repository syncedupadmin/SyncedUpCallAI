const https = require('https');

console.log("=== TESTING CONVOSO SEARCH PARAMETERS ===\n");
console.log("Which fields can we use to search for recordings?\n");

const authToken = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';
const baseUrl = 'https://api.convoso.com/v1';

// Test data from the webhook
const testData = {
  lead_id: "0",
  owner_id: "0",
  phone_number: "7173363442",
  email: "worldisonecountry@gmail.com",
  first_name: "Hardik",
  last_name: "Patel",
  created_by: "666669",
  last_modified_by: "1242071",
  list_id: "10659"
};

let testResults = [];
let completedTests = 0;
const totalTests = 12;

function runTest(testName, params) {
  const queryString = new URLSearchParams({
    auth_token: authToken,
    ...params,
    limit: '1'
  }).toString();

  const url = `${baseUrl}/leads/get-recordings?${queryString}`;

  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const result = {
          test: testName,
          params: params,
          success: parsed.success,
          message: parsed.text || '',
          foundRecordings: parsed.data?.total || 0
        };

        testResults.push(result);
        completedTests++;

        if (completedTests === totalTests) {
          printResults();
        }
      } catch (e) {
        testResults.push({
          test: testName,
          params: params,
          success: false,
          message: 'Parse error',
          foundRecordings: 0
        });
        completedTests++;

        if (completedTests === totalTests) {
          printResults();
        }
      }
    });
  }).on('error', (err) => {
    testResults.push({
      test: testName,
      params: params,
      success: false,
      message: err.message,
      foundRecordings: 0
    });
    completedTests++;

    if (completedTests === totalTests) {
      printResults();
    }
  });
}

function printResults() {
  console.log("\n=== SEARCH PARAMETER TEST RESULTS ===\n");

  const workingParams = testResults.filter(r => r.success);
  const failedParams = testResults.filter(r => !r.success);

  console.log("✅ WORKING SEARCH PARAMETERS:");
  console.log("--------------------------------");
  if (workingParams.length > 0) {
    workingParams.forEach(result => {
      console.log(`• ${result.test}: ${JSON.stringify(result.params)}`);
      console.log(`  → Found ${result.foundRecordings} recordings`);
    });
  } else {
    console.log("None found!");
  }

  console.log("\n❌ NOT WORKING SEARCH PARAMETERS:");
  console.log("------------------------------------");
  failedParams.forEach(result => {
    console.log(`• ${result.test}: ${JSON.stringify(result.params)}`);
    console.log(`  → Error: ${result.message || 'Failed'}`);
  });

  console.log("\n\n=== FINAL REPORT ===");
  console.log("====================");
  console.log("\nYOU CAN SEARCH CONVOSO RECORDINGS USING:");
  workingParams.forEach(result => {
    const paramName = Object.keys(result.params)[0];
    console.log(`✅ ${paramName}: "${result.params[paramName]}"`);
  });

  console.log("\nYOU CANNOT SEARCH USING:");
  const uniqueFailed = [...new Set(failedParams.map(r => Object.keys(r.params)[0]))];
  uniqueFailed.forEach(param => {
    console.log(`❌ ${param}`);
  });

  console.log("\n\nRECOMMENDATION:");
  if (workingParams.length > 0) {
    console.log("Use these fields to match webhook data to recordings:");
    workingParams.forEach(result => {
      const paramName = Object.keys(result.params)[0];
      console.log(`- ${paramName} from webhook → search Convoso API → get recordings`);
    });
  } else {
    console.log("No searchable fields found! You may need to:");
    console.log("- Use the call webhook instead of lead webhook");
    console.log("- Get Convoso to fix their webhook data");
    console.log("- Use a different API endpoint");
  }
}

// Run all tests
console.log("Testing search parameters...\n");

// Test 1: lead_id
runTest("Search by lead_id", { lead_id: testData.lead_id });

// Test 2: owner_id
runTest("Search by owner_id", { owner_id: testData.owner_id });

// Test 3: phone_number
runTest("Search by phone_number", { phone_number: testData.phone_number });

// Test 4: phone (alternative field name)
runTest("Search by phone", { phone: testData.phone_number });

// Test 5: email
runTest("Search by email", { email: testData.email });

// Test 6: first_name + last_name
runTest("Search by full name", {
  first_name: testData.first_name,
  last_name: testData.last_name
});

// Test 7: created_by (agent ID)
runTest("Search by created_by", { created_by: testData.created_by });

// Test 8: last_modified_by
runTest("Search by last_modified_by", { last_modified_by: testData.last_modified_by });

// Test 9: list_id
runTest("Search by list_id", { list_id: testData.list_id });

// Test 10: agent_id (using created_by value)
runTest("Search by agent_id", { agent_id: testData.created_by });

// Test 11: user_id (using created_by value)
runTest("Search by user_id", { user_id: testData.created_by });

// Test 12: customer_phone
runTest("Search by customer_phone", { customer_phone: testData.phone_number });