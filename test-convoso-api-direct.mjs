// Test Convoso API directly to see what's available
const CONVOSO_AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';
const CONVOSO_API_BASE = 'https://api.convoso.com/v1';

async function testConvosoAPI() {
  console.log('=== TESTING CONVOSO API DIRECTLY ===\n');

  // Get current date and 7 days back
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  // Format dates for API (YYYY-MM-DD HH:MM:SS)
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const startTime = `${formatDate(startDate)} 00:00:00`;
  const endTime = `${formatDate(endDate)} 23:59:59`;

  console.log(`Fetching calls from ${startTime} to ${endTime}`);

  // Test 1: Use log/retrieve endpoint (the one that's currently working)
  console.log('\n1. Testing /log/retrieve endpoint...');
  try {
    const params = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN,
      start_time: startTime,
      end_time: endTime,
      include_recordings: '1',
      limit: '10',  // Just get 10 for testing
      offset: '0'
    });

    const url = `${CONVOSO_API_BASE}/log/retrieve?${params.toString()}`;
    console.log('URL:', url);

    const response = await fetch(url);
    const data = await response.json();

    console.log('Response status:', response.status);
    console.log('Success:', data.success);

    if (data.success && data.data) {
      console.log('Total found:', data.data.total_found);
      console.log('Entries returned:', data.data.entries);

      if (data.data.results && data.data.results.length > 0) {
        console.log('\nFirst 3 calls:');
        data.data.results.slice(0, 3).forEach((call, i) => {
          console.log(`\n${i + 1}. Call ID: ${call.id}`);
          console.log(`   Lead ID: ${call.lead_id}`);
          console.log(`   Date: ${call.call_date}`);
          console.log(`   Agent: ${call.user}`);
          console.log(`   Duration: ${call.call_length} seconds`);
          console.log(`   Status: ${call.status_name}`);
          console.log(`   Has Recording: ${!!call.recording?.[0]?.public_url}`);
          if (call.recording?.[0]?.public_url) {
            console.log(`   Recording URL: ${call.recording[0].public_url.substring(0, 100)}...`);
          }
        });

        // Get unique agents
        const agents = [...new Set(data.data.results.map(r => r.user))];
        console.log('\nUnique agents found:', agents.slice(0, 10).join(', '));
      } else {
        console.log('No results returned');
      }
    } else {
      console.log('API error:', data.text || data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error:', error);
  }

  // Test 2: Try a simple request with just 1 day back
  console.log('\n2. Testing with just 1 day back...');
  try {
    const oneDayBack = new Date();
    oneDayBack.setDate(oneDayBack.getDate() - 1);
    const recentStart = `${formatDate(oneDayBack)} 00:00:00`;

    const params = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN,
      start_time: recentStart,
      end_time: endTime,
      include_recordings: '1',
      limit: '5',
      offset: '0'
    });

    const url = `${CONVOSO_API_BASE}/log/retrieve?${params.toString()}`;
    const response = await fetch(url);
    const data = await response.json();

    console.log('Total found (1 day):', data.data?.total_found || 0);

    if (data.data?.results?.length > 0) {
      console.log('Found recent calls!');
      const withRecordings = data.data.results.filter(r => r.recording?.[0]?.public_url);
      console.log(`Calls with recordings: ${withRecordings.length}/${data.data.results.length}`);
    }
  } catch (error) {
    console.error('Error:', error);
  }

  // Test 3: Check if we need to use different date format
  console.log('\n3. Testing date format variations...');
  const testDates = [
    '2025-09-20 00:00:00',  // Recent date
    '2025-09-15 00:00:00',  // Week ago
    '2025-09-01 00:00:00'   // Start of month
  ];

  for (const testDate of testDates) {
    try {
      const params = new URLSearchParams({
        auth_token: CONVOSO_AUTH_TOKEN,
        start_time: testDate,
        end_time: endTime,
        include_recordings: '1',
        limit: '1',
        offset: '0'
      });

      const response = await fetch(`${CONVOSO_API_BASE}/log/retrieve?${params.toString()}`);
      const data = await response.json();

      if (data.success && data.data?.total_found > 0) {
        console.log(`✅ Date ${testDate}: Found ${data.data.total_found} calls`);
        break;
      } else {
        console.log(`❌ Date ${testDate}: No calls found`);
      }
    } catch (error) {
      console.log(`❌ Date ${testDate}: Error`);
    }
  }
}

testConvosoAPI().catch(console.error);