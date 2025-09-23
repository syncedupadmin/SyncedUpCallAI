// SIMPLE WORKING TEST - NO BS
import { readFileSync } from 'fs';
import FormData from 'form-data';

const MP3_PATH = 'C:\\Users\\nicho\\Downloads\\iokjakye7l\\103833_1253813_9189820488_10438787_4123_1758575563_3706-in-1758575563.mp3';
const API_URL = 'http://localhost:3000';

async function testNow() {
  console.log('=== TESTING YOUR MP3 FILE ===\n');

  try {
    // 1. Read the MP3 file
    console.log('Reading MP3 file...');
    const audioBuffer = readFileSync(MP3_PATH);
    console.log(`File size: ${audioBuffer.length} bytes`);

    // 2. Upload to a file sharing service (we'll use file.io for simplicity)
    console.log('\nUploading to temporary storage...');
    const formData = new FormData();
    formData.append('file', audioBuffer, 'test.mp3');

    const uploadRes = await fetch('https://file.io/?expires=1d', {
      method: 'POST',
      body: formData
    });

    const uploadData = await uploadRes.json();
    if (!uploadData.success) {
      console.error('Upload failed');
      return;
    }

    const audioUrl = uploadData.link;
    console.log('Uploaded to:', audioUrl);

    // 3. Create test case in our system
    console.log('\nCreating test case...');
    const createRes = await fetch(`${API_URL}/api/testing/bulk-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
        audio_urls: [audioUrl]
      })
    });

    const createData = await createRes.json();
    console.log('Test case created:', createData);

    if (!createData.success) {
      console.error('Failed to create test case');
      return;
    }

    const testCaseId = createData.details?.imported?.[0]?.test_case_id;
    console.log('Test case ID:', testCaseId);

    // 4. Run the test
    console.log('\nRunning test...');
    const runRes = await fetch(`${API_URL}/api/testing/run/876b6b65-ddaa-42fe-aecd-80457cb66035`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parallel: 1
      })
    });

    const runData = await runRes.json();
    console.log('Test run response:', runData);

    console.log('\n✅ DONE - Check http://localhost:3000/testing/dashboard for results');

  } catch (error) {
    console.error('Error:', error);
  }
}

testNow();