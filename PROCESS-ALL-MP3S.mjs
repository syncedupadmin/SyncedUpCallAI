// PROCESS ALL 1249 MP3 FILES
import fs from 'fs';
import path from 'path';

const MP3_DIR = 'C:\\Users\\nicho\\Downloads\\iokjakye7l';
const API_URL = 'http://localhost:3000';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';

async function PROCESS_ALL_MP3S() {
  console.log('=== PROCESSING ALL YOUR MP3 FILES ===\n');

  // Step 1: Get all MP3 files
  console.log('Step 1: Finding all MP3 files...');
  const files = fs.readdirSync(MP3_DIR).filter(f => f.endsWith('.mp3'));
  console.log(`Found ${files.length} MP3 files`);

  // Step 2: Copy to public folder in batches
  console.log('\nStep 2: Copying MP3s to public folder...');
  const publicDir = 'C:\\Users\\nicho\\OneDrive\\Desktop\\SyncedUpCallAI\\public\\test-audio';
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Process in batches of 50
  const batchSize = 50;
  let totalCreated = 0;
  let totalFailed = 0;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    console.log(`\nProcessing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(files.length/batchSize)} (${batch.length} files)...`);

    const audioUrls = [];

    // Copy files in this batch
    for (const file of batch) {
      try {
        const src = path.join(MP3_DIR, file);
        const dest = path.join(publicDir, file);
        fs.copyFileSync(src, dest);
        audioUrls.push(`http://localhost:3000/test-audio/${file}`);
      } catch (error) {
        console.log(`  Failed to copy ${file}:`, error.message);
      }
    }

    // Create test cases for this batch
    if (audioUrls.length > 0) {
      try {
        const res = await fetch(`${API_URL}/api/testing/bulk-create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': ADMIN_SECRET
          },
          body: JSON.stringify({
            suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
            audio_urls: audioUrls
          })
        });

        const data = await res.json();
        if (data.success) {
          console.log(`  ✅ Created ${data.imported} test cases`);
          totalCreated += data.imported;
        } else {
          console.log(`  ❌ Batch failed:`, data.error);
          totalFailed += batch.length;
        }
      } catch (error) {
        console.log(`  ❌ Error creating test cases:`, error.message);
        totalFailed += batch.length;
      }
    }

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total files: ${files.length}`);
  console.log(`Test cases created: ${totalCreated}`);
  console.log(`Failed: ${totalFailed}`);
  console.log('\nYour MP3 files are now ready for testing!');
  console.log('Go to: http://localhost:3000/testing/dashboard');
  console.log('\nTo run tests on all of them:');
  console.log('1. Click "Run Suite" button on the dashboard');
  console.log('2. Or use the API to run tests programmatically');
}

// Ask for confirmation
console.log('This will process ALL 1249 MP3 files.');
console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');

setTimeout(() => {
  PROCESS_ALL_MP3S().catch(console.error);
}, 5000);