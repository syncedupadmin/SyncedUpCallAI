// Direct test of Convoso API to see what data we're getting

const CONVOSO_AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';
const CONVOSO_API_BASE = 'https://api.convoso.com/v1';

async function testConvosoAPI() {
  console.log('Testing Convoso API directly...\n');

  // Test with a 30-day range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  // Format dates
  const formatDateTime = (date, isEnd = false) => {
    const dateStr = date.toISOString().split('T')[0];
    return isEnd ? `${dateStr} 23:59:59` : `${dateStr} 00:00:00`;
  };

  const params = new URLSearchParams({
    auth_token: CONVOSO_AUTH_TOKEN,
    start_time: formatDateTime(startDate),
    end_time: formatDateTime(endDate, true),
    include_recordings: '1',
    limit: '10',  // Just get 10 for testing
    offset: '0'
  });

  const url = `${CONVOSO_API_BASE}/log/retrieve?${params.toString()}`;

  console.log('Request URL:', url);
  console.log('Date range:', formatDateTime(startDate), 'to', formatDateTime(endDate, true));
  console.log('\nFetching...\n');

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('Response not OK:', response.status);
    }

    if (data.success === false) {
      console.error('API returned failure:', data.text || data.error);
      return;
    }

    console.log('Response success:', data.success !== false);
    console.log('Total found:', data.data?.total_found || 0);
    console.log('Results in this page:', data.data?.results?.length || 0);

    if (data.data?.results && data.data.results.length > 0) {
      console.log('\nFirst few calls:');

      data.data.results.slice(0, 3).forEach((call, i) => {
        console.log(`\nCall ${i + 1}:`);
        console.log('  ID:', call.id);
        console.log('  Date:', call.call_date);
        console.log('  Duration:', call.call_length, 'seconds');
        console.log('  User:', call.user || 'Unknown');
        console.log('  Status:', call.status_name || call.status);
        console.log('  Has recording:', !!call.recording);
        if (call.recording && call.recording[0]) {
          console.log('  Recording URL:', call.recording[0].public_url || call.recording[0].src || 'No URL');
        }
      });

      // Check how many have recordings
      const withRecordings = data.data.results.filter(call =>
        call.recording && call.recording[0] &&
        (call.recording[0].public_url || call.recording[0].src)
      );

      console.log(`\n${withRecordings.length} out of ${data.data.results.length} calls have recordings`);

      // Check duration distribution
      const durationsValid = data.data.results.filter(call => {
        const duration = parseInt(call.call_length) || 0;
        return duration >= 10 && duration <= 300;
      });

      console.log(`${durationsValid.length} calls have duration between 10-300 seconds`);

      // Check dispositions
      const dispositions = {};
      data.data.results.forEach(call => {
        const disp = call.status_name || call.status || 'UNKNOWN';
        dispositions[disp] = (dispositions[disp] || 0) + 1;
      });

      console.log('\nDisposition breakdown:');
      Object.entries(dispositions).forEach(([disp, count]) => {
        console.log(`  ${disp}: ${count}`);
      });

    } else {
      console.log('\nNo results found in the response');
      console.log('Full response:', JSON.stringify(data, null, 2));
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testConvosoAPI();