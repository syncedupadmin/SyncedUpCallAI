// Script to extract full transcript from the API
import fs from 'fs';

async function extractTranscript() {
  const url = 'http://localhost:3006/api/analyze';
  const payload = {
    recording_url: "https://admin-dt.convoso.com/play-recording-public/JTdCJTIyYWNjb3VudF9pZCUyMiUzQTEwMzgzMyUyQyUyMnVfaWQlMjIlM0ElMjJkejZxZjNxYm93cHE1MzgwZnE1N2hyamV2MHk3c3BzdyUyMiU3RA==?rlt=NBGIOmIsrZdg/ij12A4673bVaGSr3u603VQy3cqsef8",
    meta: {
      agent_id: "test",
      campaign: "test",
      duration_sec: 0,
      disposition: "Unknown",
      direction: "outbound"
    }
  };

  console.log('Fetching transcript from API...');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    // Extract the full debug data which contains the transcript
    if (data.debug && data.debug.segments) {
      console.log('\n=== FULL TRANSCRIPT ===\n');
      console.log(`Total segments: ${data.debug.segments.length}\n`);

      // Format and print each segment
      data.debug.segments.forEach((seg, i) => {
        const time = seg.startMs ? `[${Math.floor(seg.startMs/1000)}s]` : '[??s]';
        console.log(`${i+1}. ${time} ${seg.speaker}: ${seg.text}`);
      });

      // Save to file
      const transcript = data.debug.segments.map((seg, i) => {
        const time = seg.startMs ? `[${Math.floor(seg.startMs/1000)}s]` : '[??s]';
        return `${i+1}. ${time} ${seg.speaker}: ${seg.text}`;
      }).join('\n');

      fs.writeFileSync('full_transcript.txt', transcript);
      console.log('\n\nFull transcript saved to full_transcript.txt');

      // Also save the complete JSON response
      fs.writeFileSync('full_response.json', JSON.stringify(data, null, 2));
      console.log('Complete response saved to full_response.json');
    } else {
      console.log('No transcript segments found in response');
      console.log('Response structure:', Object.keys(data));
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

extractTranscript();