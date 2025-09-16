#!/usr/bin/env node

/**
 * Convoso Integration Diagnostic Script
 * This script will analyze your database to understand what data Convoso is actually sending
 * and help fix the integration issues
 */

const pg = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

async function diagnose() {
  console.log('🔍 CONVOSO INTEGRATION DIAGNOSTIC');
  console.log('==================================\n');

  try {
    await client.connect();

    // 1. Check recent webhook events
    console.log('📥 1. RECENT WEBHOOK EVENTS (Last 5):');
    console.log('-------------------------------------');
    const webhookEvents = await client.query(`
      SELECT
        id,
        type,
        at,
        payload
      FROM call_events
      WHERE type IN ('webhook_received', 'lead_webhook_received', 'webhook_echo')
      ORDER BY at DESC
      LIMIT 5
    `);

    if (webhookEvents.rows.length === 0) {
      console.log('❌ No webhook events found!');
    } else {
      webhookEvents.rows.forEach((event, i) => {
        console.log(`\nEvent ${i + 1}:`);
        console.log(`  Type: ${event.type}`);
        console.log(`  Time: ${event.at}`);
        console.log(`  Sample fields from payload:`);
        const payload = event.payload;
        if (payload) {
          console.log(`    - first_name: ${payload.first_name || 'NOT PRESENT'}`);
          console.log(`    - last_name: ${payload.last_name || 'NOT PRESENT'}`);
          console.log(`    - phone_number: ${payload.phone_number || 'NOT PRESENT'}`);
          console.log(`    - agent_name: ${payload.agent_name || 'NOT PRESENT'}`);
          console.log(`    - disposition: ${payload.disposition || 'NOT PRESENT'}`);
          console.log(`    - duration: ${payload.duration || 'NOT PRESENT'}`);
          console.log(`    - recording_url: ${payload.recording_url || 'NOT PRESENT'}`);
          console.log(`    - call_id: ${payload.call_id || 'NOT PRESENT'}`);
          console.log(`    - lead_id: ${payload.lead_id || 'NOT PRESENT'}`);
        }
      });
    }

    // 2. Check calls table structure
    console.log('\n\n📞 2. CALLS TABLE ANALYSIS:');
    console.log('---------------------------');
    const callsAnalysis = await client.query(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(agent_name) as has_agent_name,
        COUNT(phone_number) as has_phone_number,
        COUNT(disposition) as has_disposition,
        COUNT(recording_url) as has_recording_url,
        COUNT(call_id) as has_call_id,
        COUNT(lead_id) as has_lead_id,
        COUNT(duration) as has_duration
      FROM calls
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);

    const stats = callsAnalysis.rows[0];
    console.log(`Total calls (last 7 days): ${stats.total_calls}`);
    console.log(`Calls with agent_name: ${stats.has_agent_name} (${Math.round(stats.has_agent_name/stats.total_calls*100)}%)`);
    console.log(`Calls with phone_number: ${stats.has_phone_number} (${Math.round(stats.has_phone_number/stats.total_calls*100)}%)`);
    console.log(`Calls with disposition: ${stats.has_disposition} (${Math.round(stats.has_disposition/stats.total_calls*100)}%)`);
    console.log(`Calls with recording_url: ${stats.has_recording_url} (${Math.round(stats.has_recording_url/stats.total_calls*100)}%)`);
    console.log(`Calls with call_id: ${stats.has_call_id} (${Math.round(stats.has_call_id/stats.total_calls*100)}%)`);
    console.log(`Calls with lead_id: ${stats.has_lead_id} (${Math.round(stats.has_lead_id/stats.total_calls*100)}%)`);

    // 3. Sample recent calls
    console.log('\n\n📋 3. SAMPLE RECENT CALLS (Last 3):');
    console.log('------------------------------------');
    const sampleCalls = await client.query(`
      SELECT
        id,
        call_id,
        lead_id,
        agent_name,
        phone_number,
        disposition,
        duration,
        recording_url,
        started_at,
        created_at,
        source
      FROM calls
      ORDER BY created_at DESC
      LIMIT 3
    `);

    sampleCalls.rows.forEach((call, i) => {
      console.log(`\nCall ${i + 1}:`);
      console.log(`  ID: ${call.id}`);
      console.log(`  Call ID: ${call.call_id || 'NULL'}`);
      console.log(`  Lead ID: ${call.lead_id || 'NULL'}`);
      console.log(`  Agent: ${call.agent_name || 'NULL'}`);
      console.log(`  Phone: ${call.phone_number || 'NULL'}`);
      console.log(`  Disposition: ${call.disposition || 'NULL'}`);
      console.log(`  Duration: ${call.duration || 'NULL'}`);
      console.log(`  Recording: ${call.recording_url ? 'YES' : 'NO'}`);
      console.log(`  Source: ${call.source || 'NULL'}`);
    });

    // 4. Check contacts table
    console.log('\n\n👥 4. CONTACTS TABLE ANALYSIS:');
    console.log('------------------------------');
    const contactsAnalysis = await client.query(`
      SELECT
        COUNT(*) as total_contacts,
        COUNT(lead_id) as has_lead_id,
        COUNT(first_name) as has_first_name,
        COUNT(last_name) as has_last_name,
        COUNT(phone_number) as has_phone_number
      FROM contacts
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);

    const contactStats = contactsAnalysis.rows[0];
    console.log(`Total contacts (last 7 days): ${contactStats.total_contacts}`);
    console.log(`Contacts with lead_id: ${contactStats.has_lead_id}`);
    console.log(`Contacts with names: ${contactStats.has_first_name}`);

    // 5. Check pending recordings
    console.log('\n\n🎙️ 5. PENDING RECORDINGS:');
    console.log('-------------------------');
    const pendingRecordings = await client.query(`
      SELECT
        COUNT(*) as total_pending,
        COUNT(*) FILTER (WHERE attempts = 0) as not_attempted,
        COUNT(*) FILTER (WHERE attempts > 0 AND attempts < 3) as retrying,
        COUNT(*) FILTER (WHERE attempts >= 3) as failed
      FROM pending_recordings
    `);

    const pendingStats = pendingRecordings.rows[0];
    console.log(`Total pending: ${pendingStats.total_pending}`);
    console.log(`Not attempted: ${pendingStats.not_attempted}`);
    console.log(`Retrying (1-2 attempts): ${pendingStats.retrying}`);
    console.log(`Failed (3+ attempts): ${pendingStats.failed}`);

    // 6. DIAGNOSIS
    console.log('\n\n🔬 DIAGNOSIS:');
    console.log('-------------');

    if (stats.has_agent_name === 0 && stats.has_disposition === 0) {
      console.log('❌ PROBLEM: No call data is being captured!');
      console.log('   Convoso is likely sending LEAD webhooks only, not CALL webhooks.');
      console.log('   You need to configure Convoso to send call completion webhooks.');
    } else if (stats.has_recording_url === 0) {
      console.log('⚠️ WARNING: Calls are being captured but no recordings!');
      console.log('   The recording URLs are not included in the webhooks.');
      console.log('   You may need to fetch them separately via the Convoso API.');
    } else {
      console.log('✅ System appears to be receiving call data correctly.');
    }

    // 7. RECOMMENDATIONS
    console.log('\n\n💡 RECOMMENDATIONS:');
    console.log('-------------------');
    console.log('1. In Convoso webhook settings, ensure you have TWO webhooks configured:');
    console.log('   - Lead webhook → https://synced-up-call-ai.vercel.app/api/webhooks/convoso');
    console.log('   - Call webhook → https://synced-up-call-ai.vercel.app/api/webhooks/convoso-calls');
    console.log('\n2. The Call webhook should trigger on "Call Complete" or "Call Disposition" events');
    console.log('\n3. Make sure the Call webhook includes these fields:');
    console.log('   - call_id or uniqueid');
    console.log('   - agent_name or agent');
    console.log('   - disposition');
    console.log('   - duration');
    console.log('   - recording_url (if available)');
    console.log('\n4. Set the webhook secret header: X-Webhook-Secret');

    // 8. Check if we can match contacts to calls
    console.log('\n\n🔗 8. DATA MATCHING POTENTIAL:');
    console.log('------------------------------');
    const matchingPotential = await client.query(`
      SELECT
        COUNT(DISTINCT c.id) as calls_with_lead_id,
        COUNT(DISTINCT ct.id) as matching_contacts
      FROM calls c
      LEFT JOIN contacts ct ON ct.lead_id = c.lead_id
      WHERE c.lead_id IS NOT NULL
        AND c.created_at > NOW() - INTERVAL '7 days'
    `);

    const matching = matchingPotential.rows[0];
    console.log(`Calls with lead_id: ${matching.calls_with_lead_id}`);
    console.log(`Matching contacts found: ${matching.matching_contacts}`);

    if (matching.calls_with_lead_id > 0 && matching.matching_contacts > 0) {
      console.log('✅ Good! We can match some calls to contacts via lead_id');
    } else {
      console.log('❌ Cannot match calls to contacts - lead_id may not be consistent');
    }

  } catch (error) {
    console.error('\n❌ Error during diagnosis:', error.message);
  } finally {
    await client.end();
    console.log('\n\n✅ Diagnostic complete!');
  }
}

// Run the diagnostic
diagnose().catch(console.error);