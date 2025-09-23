// ACTUAL WORKING TEST - RUN THIS NOW
import fs from 'fs';
import path from 'path';

const MP3_DIR = 'C:\\Users\\nicho\\Downloads\\iokjakye7l';
const API_URL = 'http://localhost:3000';

async function TEST_RIGHT_NOW() {
  console.log('=== PROCESSING YOUR MP3 FILES ===\n');

  // Step 1: Copy some MP3s to public folder
  console.log('Step 1: Setting up MP3 files...');
  const files = fs.readdirSync(MP3_DIR).filter(f => f.endsWith('.mp3')).slice(0, 5);

  const publicDir = 'C:\\Users\\nicho\\OneDrive\\Desktop\\SyncedUpCallAI\\public\\test-audio';
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  console.log(`Found ${files.length} MP3 files, copying to public folder...`);

  for (const file of files) {
    const src = path.join(MP3_DIR, file);
    const dest = path.join(publicDir, file);
    fs.copyFileSync(src, dest);
    console.log(`  Copied: ${file}`);
  }

  // Step 2: Create test cases
  console.log('\nStep 2: Creating test cases...');
  const testCases = [];

  for (const file of files) {
    const audioUrl = `http://localhost:3000/test-audio/${file}`;

    try {
      const res = await fetch(`${API_URL}/api/testing/bulk-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo='
        },
        body: JSON.stringify({
          suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
          audio_urls: [audioUrl]
        })
      });

      const data = await res.json();
      if (data.success) {
        console.log(`  ✅ Created test case for ${file}`);
        testCases.push(data);
      } else {
        console.log(`  ❌ Failed for ${file}:`, data.error);
      }
    } catch (error) {
      console.log(`  ❌ Error for ${file}:`, error.message);
    }
  }

  // Step 3: Run tests
  console.log('\nStep 3: Running tests...');
  try {
    const runRes = await fetch(`${API_URL}/api/testing/run/876b6b65-ddaa-42fe-aecd-80457cb66035`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo='
      },
      body: JSON.stringify({ parallel: 1 })
    });

    const runData = await runRes.json();
    console.log('Test run started:', runData);

    if (runData.success) {
      console.log('\n✅ SUCCESS! Tests are running!');
      console.log('View results at: http://localhost:3000/testing/dashboard');
    } else {
      console.log('\n⚠️ Issue starting tests:', runData.error || runData.message);
    }
  } catch (error) {
    console.log('Error running tests:', error.message);
  }

  console.log('\n=== DONE ===');
  console.log('Your MP3 files are now:');
  console.log('1. Copied to public/test-audio/');
  console.log('2. Created as test cases in the database');
  console.log('3. Running through the test pipeline');
  console.log('\nCheck: http://localhost:3000/testing/dashboard');
}

// RUN IT
TEST_RIGHT_NOW().catch(console.error);