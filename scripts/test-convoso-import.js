#!/usr/bin/env node

/**
 * Test script to validate Convoso data import flow
 * This tests the actual import process using the ConvosoService class
 */

import { ConvosoService } from '../src/lib/convoso-service.js';

async function testImport() {
  console.log('=========================================');
  console.log('  CONVOSO IMPORT TEST');
  console.log('=========================================\n');

  const service = new ConvosoService();

  // Test dates - last 7 days
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const dateFrom = weekAgo.toISOString().split('T')[0];
  const dateTo = today.toISOString().split('T')[0];

  console.log(`Date range: ${dateFrom} to ${dateTo}\n`);

  try {
    // Step 1: Fetch recordings
    console.log('Step 1: Fetching recordings...');
    const recordings = await service.fetchRecordings(dateFrom, dateTo);
    console.log(`✅ Found ${recordings.length} recordings\n`);

    if (recordings.length === 0) {
      console.log('No recordings found. Try a different date range.');
      return;
    }

    // Step 2: Get control settings
    console.log('Step 2: Getting control settings...');
    const settings = await service.getControlSettings();
    console.log('Control settings:', {
      enabled: settings.system_enabled,
      campaigns: settings.active_campaigns.length,
      lists: settings.active_lists.length,
      dispositions: settings.active_dispositions.length,
      agents: settings.active_agents.length
    });
    console.log('');

    // Step 3: Fetch and combine data (first 5 for testing)
    console.log('Step 3: Enriching recordings with lead data...');
    const testRecordings = recordings.slice(0, 5);
    const enrichedCalls = [];

    for (const recording of testRecordings) {
      const lead = await service.fetchLeadData(recording.lead_id);
      const combined = service.combineCallData(recording, lead);
      enrichedCalls.push(combined);

      console.log(`✅ Enriched recording ${recording.recording_id}:`);
      console.log(`   - Lead: ${combined.customer_first_name} ${combined.customer_last_name}`);
      console.log(`   - Phone: ${combined.customer_phone}`);
      console.log(`   - Agent: ${combined.agent_name}`);
      console.log(`   - Duration: ${combined.duration_seconds} seconds`);
      console.log(`   - Disposition: ${combined.disposition}`);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('');

    // Step 4: Apply filters
    console.log('Step 4: Applying control filters...');
    const filteredCalls = service.applyFilters(enrichedCalls, settings);
    console.log(`Filtered from ${enrichedCalls.length} to ${filteredCalls.length} calls\n`);

    // Step 5: Preview data that would be saved
    console.log('Step 5: Preview database records...');
    if (filteredCalls.length > 0) {
      const sampleCall = filteredCalls[0];
      const dbRecord = {
        call_id: `convoso_${sampleCall.recording_id}`,
        lead_id: sampleCall.lead_id,
        convoso_lead_id: sampleCall.lead_id,
        agent_name: sampleCall.agent_name,
        disposition: sampleCall.disposition,
        duration_sec: sampleCall.duration_seconds, // Correct field name
        phone_number: sampleCall.customer_phone,
        recording_url: sampleCall.recording_url,
        campaign: sampleCall.campaign_name,
        started_at: sampleCall.start_time,
        ended_at: sampleCall.end_time,
        metadata: {
          customer_name: `${sampleCall.customer_first_name} ${sampleCall.customer_last_name}`.trim(),
          list_name: sampleCall.list_name
        }
      };

      console.log('Sample database record:');
      console.log(JSON.stringify(dbRecord, null, 2));
    }

    // Note: Not actually saving to database in test mode
    console.log('\n✅ Test complete! Data structure validated.');
    console.log('Note: No data was actually saved to the database (test mode).');

  } catch (error) {
    console.error('❌ Error during test:', error.message);
    console.error(error.stack);
  }
}

// Run the test
console.log('Note: This test uses the actual ConvosoService class\n');
testImport().catch(console.error);