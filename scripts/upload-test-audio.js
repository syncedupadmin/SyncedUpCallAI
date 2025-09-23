const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');

// Configuration
const DIRECTORY_PATH = 'C:\\Users\\nicho\\Downloads\\iokjakye7l';
const API_BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const BATCH_SIZE = 10; // Process 10 files at a time
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function uploadFilesToSupabase() {
  console.log('📂 Reading directory:', DIRECTORY_PATH);

  try {
    // Read all MP3 files
    const files = await fs.readdir(DIRECTORY_PATH);
    const mp3Files = files.filter(f => f.endsWith('.mp3'));

    console.log(`Found ${mp3Files.length} MP3 files`);

    if (mp3Files.length === 0) {
      console.log('No MP3 files found');
      return;
    }

    // Create test suite first
    const suiteResponse = await fetch(`${API_BASE_URL}/api/testing/create-suite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        name: `Bulk Import - ${new Date().toISOString().split('T')[0]}`,
        description: `Imported ${mp3Files.length} files from local directory`
      })
    });

    const suiteData = await suiteResponse.json();
    const suiteId = suiteData.suite?.id;

    if (!suiteId) {
      console.error('Failed to create suite:', suiteData);
      return;
    }

    console.log('✅ Created test suite:', suiteId);

    // Process files in batches
    const results = {
      uploaded: [],
      failed: []
    };

    for (let i = 0; i < mp3Files.length; i += BATCH_SIZE) {
      const batch = mp3Files.slice(i, Math.min(i + BATCH_SIZE, mp3Files.length));
      console.log(`\n📤 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(mp3Files.length/BATCH_SIZE)}`);

      for (const fileName of batch) {
        try {
          const filePath = path.join(DIRECTORY_PATH, fileName);
          const fileBuffer = await fs.readFile(filePath);

          // Extract metadata from filename
          const parts = fileName.replace('.mp3', '').split('_');
          const metadata = {
            account: parts[0],
            campaign: parts[1],
            lead_id: parts[2],
            agent_id: parts[3],
            list: parts[4],
            timestamp: parts[5],
            original_filename: fileName
          };

          // Upload to Supabase Storage
          const storageUrl = `${SUPABASE_URL}/storage/v1/object/call-recordings/test-audio/${suiteId}/${fileName}`;

          const uploadResponse = await fetch(storageUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'audio/mpeg'
            },
            body: fileBuffer
          });

          if (!uploadResponse.ok) {
            throw new Error(`Upload failed: ${uploadResponse.statusText}`);
          }

          // Get public URL
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/call-recordings/test-audio/${suiteId}/${fileName}`;

          // Create test case
          const testCaseResponse = await fetch(`${API_BASE_URL}/api/testing/create-test-case`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
              suite_id: suiteId,
              name: `Call ${metadata.lead_id} - Agent ${metadata.agent_id}`,
              audio_url: publicUrl,
              metadata: metadata,
              ground_truth: '' // Will be populated on first transcription
            })
          });

          const testCaseData = await testCaseResponse.json();

          if (testCaseData.success || testCaseData.test_case) {
            console.log(`✅ ${fileName} uploaded successfully`);
            results.uploaded.push(fileName);
          } else {
            throw new Error(testCaseData.error || 'Failed to create test case');
          }

        } catch (error) {
          console.error(`❌ Failed to upload ${fileName}:`, error.message);
          results.failed.push({ file: fileName, error: error.message });
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < mp3Files.length) {
        console.log('Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Upload Summary:');
    console.log(`✅ Successfully uploaded: ${results.uploaded.length} files`);
    console.log(`❌ Failed: ${results.failed.length} files`);
    console.log(`📁 Test Suite ID: ${suiteId}`);
    console.log('='.repeat(50));

    if (results.failed.length > 0) {
      console.log('\nFailed files:');
      results.failed.forEach(f => console.log(`  - ${f.file}: ${f.error}`));
    }

    console.log('\n🎯 Next steps:');
    console.log('1. Go to: http://localhost:3000/testing/dashboard');
    console.log('2. Click "Run All Tests" to process these audio files');
    console.log('3. View results and metrics');

    return results;

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Run if called directly
if (require.main === module) {
  uploadFilesToSupabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { uploadFilesToSupabase };