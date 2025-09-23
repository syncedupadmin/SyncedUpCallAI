// Direct test of Convoso API to see raw call data
const CONVOSO_AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

async function testDirectConvosoAPI() {
  console.log('Testing Convoso API directly to see what calls exist...\n');

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7); // Just last 7 days

  const formatDateTime = (date, isEnd = false) => {
    const dateStr = date.toISOString().split('T')[0];
    return isEnd ? `${dateStr} 23:59:59` : `${dateStr} 00:00:00`;
  };

  const params = new URLSearchParams({
    auth_token: CONVOSO_AUTH_TOKEN,
    start_time: formatDateTime(startDate),
    end_time: formatDateTime(endDate, true),
    include_recordings: '1',
    limit: '20',  // Just get 20 for testing
    offset: '0'
  });

  const url = `https://api.convoso.com/v1/log/retrieve?${params.toString()}`;

  console.log('Date range:', formatDateTime(startDate), 'to', formatDateTime(endDate, true));
  console.log('\nFetching...\n');

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.success === false) {
      console.error('API returned failure:', data.text || data.error);
      return;
    }

    console.log('Total found:', data.data?.total_found || 0);
    console.log('Results in this page:', data.data?.results?.length || 0);

    if (data.data?.results && data.data.results.length > 0) {
      console.log('\n=== ANALYZING CALLS FOR TEST SUITABILITY ===\n');

      let goodCalls = 0;
      data.data.results.forEach((call, i) => {
        const hasRecording = call.recording &&
                           call.recording.length > 0 &&
                           (call.recording[0].public_url || call.recording[0].src);

        const duration = call.call_length ? parseInt(call.call_length) : 0;
        const disposition = call.status_name || call.status || '';

        if (hasRecording && disposition !== 'Call in Progress') {
          goodCalls++;
          console.log(`✅ GOOD Call ${i + 1}:`);
          console.log('  ID:', call.recording?.[0]?.recording_id || call.id);
          console.log('  Date:', call.call_date);
          console.log('  Duration:', call.call_length || 'null', 'seconds');
          console.log('  User:', call.user || 'Unknown');
          console.log('  Status:', disposition);
          console.log('  Recording URL:', call.recording[0].public_url || call.recording[0].src);
          console.log('');
        } else {
          console.log(`❌ SKIP Call ${i + 1}: No recording or in progress`);
        }
      });

      console.log(`\n=== SUMMARY ===`);
      console.log(`${goodCalls} out of ${data.data.results.length} calls are suitable for testing`);

    } else {
      console.log('\nNo results found in the response');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testDirectConvosoAPI();