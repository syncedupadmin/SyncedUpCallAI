// PROCESS ALL 1249 MP3 FILES WITH ROBUST ERROR HANDLING
import fs from 'fs';
import path from 'path';

const MP3_DIR = 'C:\\Users\\nicho\\Downloads\\iokjakye7l';
const API_URL = 'https://synced-up-call-ai.vercel.app';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';

// Clear stuck runs before starting
async function clearStuckRuns() {
  console.log('Clearing any stuck test runs...');
  try {
    const res = await fetch(`${API_URL}/api/testing/clear-stuck`, {
      method: 'POST',
      headers: { 'x-admin-secret': ADMIN_SECRET }
    });
    const data = await res.json();
    if (data.success) {
      console.log(`  ✅ Cleared ${data.cleared.suite_runs} stuck suite runs`);
      console.log(`  ✅ Cleared ${data.cleared.test_runs} stuck test runs`);
    }
  } catch (error) {
    console.log('  ⚠️ Could not clear stuck runs:', error.message);
  }
}

// Check if suite is ready
async function checkSuiteStatus() {
  try {
    const res = await fetch(`${API_URL}/api/testing/suites`, {
      headers: { 'x-admin-secret': ADMIN_SECRET }
    });
    const data = await res.json();
    const suite = data.suites?.find(s => s.id === SUITE_ID);
    if (suite?.current_run_status === 'running') {
      console.log('  ⚠️ Suite is currently running. Clearing stuck runs...');
      await clearStuckRuns();
      return false;
    }
    return true;
  } catch (error) {
    console.log('  ⚠️ Could not check suite status:', error.message);
    return true; // Continue anyway
  }
}

async function processMP3Batch(batch, batchNum, totalBatches) {
  console.log(`\nBatch ${batchNum}/${totalBatches} (${batch.length} files)`);

  const results = {
    created: 0,
    failed: 0,
    errors: []
  };

  // Prepare audio URLs for this batch
  const audioUrls = batch.map(file => {
    // Use direct file path with proper URL encoding
    const fileName = encodeURIComponent(file);
    return `${API_URL}/test-audio/${fileName}`;
  });

  // Upload files to server's public directory
  console.log('  Uploading files...');
  const publicDir = 'C:\\Users\\nicho\\OneDrive\\Desktop\\SyncedUpCallAI\\public\\test-audio';

  // Ensure directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Copy files
  for (const file of batch) {
    try {
      const src = path.join(MP3_DIR, file);
      const dest = path.join(publicDir, file);

      // Check if file exists before copying
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    } catch (error) {
      console.log(`    ⚠️ Failed to copy ${file}: ${error.message}`);
      results.errors.push(`Copy failed: ${file}`);
    }
  }

  // Create test cases via API
  console.log('  Creating test cases...');
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
      results.created = data.imported || audioUrls.length;
      console.log(`  ✅ Created ${results.created} test cases`);
    } else {
      results.failed = batch.length;
      results.errors.push(data.error || 'Unknown API error');
      console.log(`  ❌ Failed: ${data.error}`);
    }
  } catch (error) {
    results.failed = batch.length;
    results.errors.push(error.message);
    console.log(`  ❌ API Error: ${error.message}`);
  }

  return results;
}

async function PROCESS_ALL_MP3S() {
  console.log('=== PROCESSING ALL 1249 MP3 FILES ===\n');

  // Step 0: Clear any stuck runs
  await clearStuckRuns();

  // Step 1: Check if suite is ready
  console.log('Checking suite status...');
  const isReady = await checkSuiteStatus();
  if (!isReady) {
    console.log('\n⚠️ Suite is busy. Please try again later.');
    return;
  }

  // Step 2: Get all MP3 files
  console.log('\nFinding all MP3 files...');
  let files;
  try {
    files = fs.readdirSync(MP3_DIR).filter(f => f.endsWith('.mp3'));
    console.log(`Found ${files.length} MP3 files`);
  } catch (error) {
    console.error('❌ Could not read MP3 directory:', error.message);
    console.log(`   Make sure the directory exists: ${MP3_DIR}`);
    return;
  }

  if (files.length === 0) {
    console.log('❌ No MP3 files found in directory');
    return;
  }

  // Step 3: Process in batches
  const batchSize = 25; // Smaller batches for reliability
  const totalBatches = Math.ceil(files.length / batchSize);

  console.log(`\nProcessing ${files.length} files in ${totalBatches} batches of ${batchSize}...`);

  const stats = {
    totalCreated: 0,
    totalFailed: 0,
    totalErrors: []
  };

  // Process each batch
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, Math.min(i + batchSize, files.length));
    const batchNum = Math.floor(i / batchSize) + 1;

    const results = await processMP3Batch(batch, batchNum, totalBatches);

    stats.totalCreated += results.created;
    stats.totalFailed += results.failed;
    stats.totalErrors.push(...results.errors);

    // Progress update
    const progress = Math.round((i + batch.length) / files.length * 100);
    console.log(`  Progress: ${progress}% (${i + batch.length}/${files.length} files)`);

    // Small delay between batches to avoid overwhelming the server
    if (batchNum < totalBatches) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Step 4: Summary
  console.log('\n' + '='.repeat(50));
  console.log('PROCESSING COMPLETE');
  console.log('='.repeat(50));
  console.log(`Total files processed: ${files.length}`);
  console.log(`Test cases created: ${stats.totalCreated}`);
  console.log(`Failed: ${stats.totalFailed}`);

  if (stats.totalErrors.length > 0) {
    console.log('\nErrors encountered:');
    const uniqueErrors = [...new Set(stats.totalErrors)];
    uniqueErrors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
    if (uniqueErrors.length > 10) {
      console.log(`  ... and ${uniqueErrors.length - 10} more errors`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('NEXT STEPS:');
  console.log('='.repeat(50));
  console.log('1. View dashboard: https://synced-up-call-ai.vercel.app/testing/dashboard');
  console.log('2. Run tests on all files:');
  console.log('   - Use "Run Suite" button on dashboard');
  console.log('   - Or run: node RUN-ALL-TESTS.mjs');
  console.log('\n3. Monitor progress:');
  console.log('   - Check transcription queue status');
  console.log('   - View test results as they complete');

  // Step 5: Optionally start a test run
  console.log('\n' + '='.repeat(50));
  console.log('OPTIONAL: Start test run now? (Waiting 5 seconds...)');
  console.log('Press Ctrl+C to skip, or wait to auto-start tests');
  console.log('='.repeat(50));

  setTimeout(async () => {
    console.log('\nStarting test run...');
    try {
      const runRes = await fetch(`${API_URL}/api/testing/run/${SUITE_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': ADMIN_SECRET
        },
        body: JSON.stringify({
          parallel: 5,  // Run 5 tests in parallel
          stopOnFailure: false,
          limit: 100  // Start with first 100 tests
        })
      });

      const runData = await runRes.json();

      if (runData.success) {
        console.log('✅ Test run started!');
        console.log(`   Run ID: ${runData.suite_run_id}`);
        console.log(`   Running ${runData.total_tests} tests`);
        console.log('\n📊 Monitor progress at:');
        console.log('   https://synced-up-call-ai.vercel.app/testing/dashboard');
      } else {
        console.log('⚠️ Could not start test run:', runData.error || runData.message);
        console.log('   You can manually start tests from the dashboard');
      }
    } catch (error) {
      console.log('⚠️ Error starting test run:', error.message);
      console.log('   You can manually start tests from the dashboard');
    }
  }, 5000);
}

// Main execution
console.log('=' .repeat(50));
console.log('MP3 BATCH PROCESSOR');
console.log('=' .repeat(50));
console.log(`Source: ${MP3_DIR}`);
console.log(`Target: ${API_URL}`);
console.log('');
console.log('This will:');
console.log('1. Clear any stuck test runs');
console.log('2. Process all MP3 files in batches');
console.log('3. Create test cases for each file');
console.log('4. Optionally start a test run');
console.log('');
console.log('Starting in 3 seconds... (Press Ctrl+C to cancel)');

setTimeout(() => {
  PROCESS_ALL_MP3S().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}, 3000);