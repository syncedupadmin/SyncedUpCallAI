#!/usr/bin/env node

/**
 * Batch Process Calls Script
 * Processes unprocessed calls through transcription and analysis pipeline
 *
 * Usage:
 *   node batch-process-calls.js
 *
 * Environment variables needed:
 *   - ADMIN_EMAIL: Your admin email
 *   - ADMIN_PASSWORD: Your admin password
 *   - APP_URL: Application URL (defaults to https://synced-up-call-ai.vercel.app)
 */

const APP_URL = process.env.APP_URL || 'https://synced-up-call-ai.vercel.app';

// Simple auth - you should use proper auth in production
async function authenticate() {
  // For now, we'll use the admin token approach
  // In production, implement proper Supabase auth
  return {
    token: process.env.ADMIN_TOKEN || 'your-auth-token'
  };
}

async function getUnprocessedCalls() {
  const auth = await authenticate();

  const response = await fetch(`${APP_URL}/api/admin/process-calls?limit=100`, {
    headers: {
      'Authorization': `Bearer ${auth.token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch calls: ${response.status}`);
  }

  return await response.json();
}

async function processBatch(callIds, options = {}) {
  const auth = await authenticate();

  const response = await fetch(`${APP_URL}/api/admin/process-calls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth.token}`
    },
    body: JSON.stringify({
      call_ids: callIds,
      delay_ms: options.delayMs || 500
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to process batch: ${response.status}`);
  }

  return await response.json();
}

async function processAutoDetect(limit = 10) {
  const auth = await authenticate();

  const response = await fetch(`${APP_URL}/api/admin/process-calls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth.token}`
    },
    body: JSON.stringify({
      auto_detect: true,
      limit: limit,
      delay_ms: 1000 // 1 second between calls
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to process: ${response.status} - ${error}`);
  }

  return await response.json();
}

async function queueRecordingFetch() {
  const auth = await authenticate();

  const response = await fetch(`${APP_URL}/api/admin/process-calls`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${auth.token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to queue recordings: ${response.status}`);
  }

  return await response.json();
}

async function main() {
  console.log('🚀 SyncedUp Call Processing Tool');
  console.log('=================================\n');

  try {
    // Step 1: Check for calls that need recording fetch
    console.log('📡 Step 1: Checking for calls without recordings...');
    const queueResult = await queueRecordingFetch();
    console.log(`   Queued ${queueResult.queued} calls for recording fetch\n`);

    // Step 2: Get unprocessed calls
    console.log('📋 Step 2: Fetching unprocessed calls...');
    const { stats, calls } = await getUnprocessedCalls();

    console.log('📊 Statistics:');
    console.log(`   Total eligible calls: ${stats.total_eligible}`);
    console.log(`   Has recording: ${stats.has_recording}`);
    console.log(`   Already transcribed: ${stats.transcribed}`);
    console.log(`   Already analyzed: ${stats.analyzed}`);
    console.log(`   Pending transcription: ${stats.pending_transcription}`);
    console.log(`   Pending recording: ${stats.pending_recording}\n`);

    // Filter calls that are ready for processing
    const readyCalls = calls.filter(c => c.status === 'ready' && c.recording_url);
    console.log(`📝 Found ${readyCalls.length} calls ready for processing\n`);

    if (readyCalls.length === 0) {
      console.log('✅ No calls need processing at this time');
      return;
    }

    // Show first 5 calls
    console.log('📞 Sample calls to process:');
    readyCalls.slice(0, 5).forEach(call => {
      console.log(`   - ${call.id.substring(0, 8)}... | Agent: ${call.agent_name || 'Unknown'} | Duration: ${call.duration}s`);
    });

    // Step 3: Process calls
    console.log(`\n🔄 Step 3: Processing ${Math.min(readyCalls.length, 10)} calls...`);
    console.log('   (Processing first 10 to avoid timeout)\n');

    const result = await processAutoDetect(10);

    console.log('✨ Processing Complete!');
    console.log('======================');
    console.log(`   Total processed: ${result.summary.total}`);
    console.log(`   Successful: ${result.summary.successful}`);
    console.log(`   Failed: ${result.summary.failed}`);

    if (result.summary.errors && result.summary.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.summary.errors.forEach(err => {
        console.log(`   - Call ${err.call_id}: ${err.error}`);
      });
    }

    // Show remaining calls
    const remaining = stats.pending_transcription - result.summary.successful;
    if (remaining > 0) {
      console.log(`\n📌 Still ${remaining} calls pending. Run again to process more.`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Interactive mode
if (process.argv.includes('--interactive')) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  async function interactiveMode() {
    console.log('\n🎯 Interactive Mode\n');
    console.log('Commands:');
    console.log('  1. Check status');
    console.log('  2. Process 5 calls');
    console.log('  3. Process 10 calls');
    console.log('  4. Queue recording fetch');
    console.log('  5. Exit\n');

    rl.question('Enter command (1-5): ', async (answer) => {
      switch(answer) {
        case '1':
          const { stats } = await getUnprocessedCalls();
          console.log('\n📊 Current Status:');
          console.log(`   Pending transcription: ${stats.pending_transcription}`);
          console.log(`   Pending recording: ${stats.pending_recording}`);
          break;

        case '2':
          console.log('\n🔄 Processing 5 calls...');
          const result5 = await processAutoDetect(5);
          console.log(`   Processed: ${result5.summary.successful}/${result5.summary.total}`);
          break;

        case '3':
          console.log('\n🔄 Processing 10 calls...');
          const result10 = await processAutoDetect(10);
          console.log(`   Processed: ${result10.summary.successful}/${result10.summary.total}`);
          break;

        case '4':
          console.log('\n📡 Queuing recording fetch...');
          const queueResult = await queueRecordingFetch();
          console.log(`   Queued: ${queueResult.queued} calls`);
          break;

        case '5':
          console.log('\n👋 Goodbye!');
          rl.close();
          process.exit(0);
          break;

        default:
          console.log('\n❌ Invalid command');
      }

      // Continue interactive mode
      setTimeout(() => interactiveMode(), 1000);
    });
  }

  interactiveMode().catch(console.error);
} else {
  // Run automatic mode
  main().catch(console.error);
}