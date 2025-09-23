// Find calls with actual recordings from real agents
const CONVOSO_AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';
const CONVOSO_API_BASE = 'https://api.convoso.com/v1';

async function findRealCalls() {
  console.log('=== SEARCHING FOR CALLS WITH RECORDINGS ===\n');

  // Try different time ranges to find calls with recordings
  const endDate = new Date();

  const timeRanges = [
    { days: 1, name: 'Last 24 hours' },
    { days: 7, name: 'Last week' },
    { days: 30, name: 'Last month' },
    { days: 60, name: 'Last 2 months' }
  ];

  for (const range of timeRanges) {
    console.log(`\nSearching ${range.name}...`);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - range.days);

    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const startTime = `${formatDate(startDate)} 00:00:00`;
    const endTime = `${formatDate(endDate)} 23:59:59`;

    try {
      // Get more calls to find ones with recordings
      const params = new URLSearchParams({
        auth_token: CONVOSO_AUTH_TOKEN,
        start_time: startTime,
        end_time: endTime,
        include_recordings: '1',
        limit: '100',  // Get more to find real calls
        offset: '0',
        call_type: 'OUTBOUND'  // Try filtering for outbound calls
      });

      const url = `${CONVOSO_API_BASE}/log/retrieve?${params.toString()}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.data?.results) {
        const results = data.data.results;

        // Filter for real calls (not System DID User, has duration, has recording)
        const realCalls = results.filter(call =>
          call.user !== 'System DID User' &&
          call.user !== 'System User' &&
          parseInt(call.call_length) > 0 &&
          call.recording?.[0]?.public_url
        );

        console.log(`Total calls found: ${data.data.total_found}`);
        console.log(`Fetched: ${results.length}`);
        console.log(`Real calls with recordings: ${realCalls.length}`);

        if (realCalls.length > 0) {
          console.log('\n✅ FOUND CALLS WITH RECORDINGS!');
          console.log('\nFirst 5 real calls:');
          realCalls.slice(0, 5).forEach((call, i) => {
            console.log(`\n${i + 1}. Call Details:`);
            console.log(`   ID: ${call.id}`);
            console.log(`   Date: ${call.call_date}`);
            console.log(`   Agent: ${call.user}`);
            console.log(`   Duration: ${call.call_length} seconds`);
            console.log(`   Status: ${call.status_name}`);
            console.log(`   Campaign: ${call.campaign}`);
            console.log(`   Recording URL: ${call.recording[0].public_url.substring(0, 80)}...`);
          });

          // Get unique agents with recordings
          const agents = [...new Set(realCalls.map(r => r.user))];
          console.log('\nAgents with recordings:', agents.join(', '));

          return realCalls;
        }
      }
    } catch (error) {
      console.error(`Error searching ${range.name}:`, error.message);
    }
  }

  console.log('\n❌ No calls with recordings found in any time range');
  console.log('\nTrying to fetch ANY non-system calls...');

  // Last attempt: Get any non-system calls
  try {
    const params = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN,
      start_time: '2025-08-01 00:00:00',  // Go back further
      end_time: endTime,
      include_recordings: '1',
      limit: '500',
      offset: '0'
    });

    const response = await fetch(`${CONVOSO_API_BASE}/log/retrieve?${params.toString()}`);
    const data = await response.json();

    if (data.success && data.data?.results) {
      const nonSystemCalls = data.data.results.filter(call =>
        !call.user.includes('System') &&
        parseInt(call.call_length) > 0
      );

      console.log(`Non-system calls found: ${nonSystemCalls.length}/${data.data.results.length}`);

      if (nonSystemCalls.length > 0) {
        const agents = [...new Set(nonSystemCalls.map(r => r.user))];
        console.log('Agents found:', agents.slice(0, 10).join(', '));

        const withRecordings = nonSystemCalls.filter(c => c.recording?.[0]?.public_url);
        console.log(`Calls with recordings: ${withRecordings.length}`);
      }
    }
  } catch (error) {
    console.error('Final search error:', error);
  }
}

findRealCalls().catch(console.error);