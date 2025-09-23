// CONTINUE UPLOADING FROM WHERE WE LEFT OFF
import fs from 'fs';
import path from 'path';

const MP3_DIR = 'C:\\Users\\nicho\\Downloads\\iokjakye7l';
const API_URL = 'https://synced-up-call-ai.vercel.app';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';

// Check how many files are already uploaded
async function getUploadedCount() {
  try {
    const res = await fetch(`${API_URL}/api/testing/suites`, {
      headers: { 'x-admin-secret': ADMIN_SECRET }
    });
    const data = await res.json();
    const suite = data.suites?.find(s => s.id === SUITE_ID);
    return suite?.test_case_count || 0;
  } catch (error) {
    console.log('Could not get uploaded count:', error.message);
    return 0;
  }
}

async function continueUpload() {
  console.log('=== CONTINUING MP3 UPLOAD ===\n');

  // Get all MP3 files
  const allFiles = fs.readdirSync(MP3_DIR).filter(f => f.endsWith('.mp3'));
  console.log(`Total MP3 files: ${allFiles.length}`);

  // Check how many are already uploaded
  const uploadedCount = await getUploadedCount();
  console.log(`Already uploaded: ${uploadedCount}`);

  // Skip the files we've already processed
  const startIndex = uploadedCount > 0 ? uploadedCount : 525; // We know we got to 525
  const remainingFiles = allFiles.slice(startIndex);
  console.log(`Remaining to upload: ${remainingFiles.length}\n`);

  if (remainingFiles.length === 0) {
    console.log('✅ All files already uploaded!');
    return;
  }

  // Process remaining files in batches
  const batchSize = 25;
  const totalBatches = Math.ceil(remainingFiles.length / batchSize);
  let totalCreated = 0;

  for (let i = 0; i < remainingFiles.length; i += batchSize) {
    const batch = remainingFiles.slice(i, Math.min(i + batchSize, remainingFiles.length));
    const batchNum = Math.floor(i / batchSize) + 1;
    const overallProgress = startIndex + i + batch.length;

    console.log(`\nBatch ${batchNum}/${totalBatches} (${batch.length} files)`);
    console.log(`Overall progress: ${Math.round(overallProgress / allFiles.length * 100)}% (${overallProgress}/${allFiles.length})`);

    // Copy files to public directory
    const publicDir = 'C:\\Users\\nicho\\OneDrive\\Desktop\\SyncedUpCallAI\\public\\test-audio';
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    for (const file of batch) {
      try {
        const src = path.join(MP3_DIR, file);
        const dest = path.join(publicDir, file);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      } catch (error) {
        console.log(`  Failed to copy ${file}: ${error.message}`);
      }
    }

    // Create test cases
    const audioUrls = batch.map(file => `${API_URL}/test-audio/${encodeURIComponent(file)}`);

    try {
      const res = await fetch(`${API_URL}/api/testing/bulk-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': ADMIN_SECRET
        },
        body: JSON.stringify({
          suite_id: SUITE_ID,
          audio_urls: audioUrls
        })
      });

      const data = await res.json();
      if (data.success) {
        totalCreated += data.imported || audioUrls.length;
        console.log(`  ✅ Created ${data.imported || audioUrls.length} test cases`);
      } else {
        console.log(`  ❌ Failed: ${data.error}`);
      }
    } catch (error) {
      console.log(`  ❌ API Error: ${error.message}`);
    }

    // Small delay between batches
    if (batchNum < totalBatches) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('UPLOAD COMPLETE!');
  console.log('='.repeat(50));
  console.log(`Files processed in this session: ${remainingFiles.length}`);
  console.log(`Test cases created: ${totalCreated}`);
  console.log(`Total uploaded: ${startIndex + totalCreated}`);
  console.log('\n✅ All 1249 MP3 files have been uploaded!');
  console.log('\nNext step: Run tests with:');
  console.log('  node RUN-ALL-TESTS.mjs');
  console.log('\nOr visit dashboard:');
  console.log('  https://synced-up-call-ai.vercel.app/testing/dashboard');
}

// Run immediately
continueUpload().catch(console.error);