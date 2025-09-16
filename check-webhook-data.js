const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

(async () => {
  await client.connect();

  console.log('=== CHECKING WEBHOOK DATA ===\n');

  // Check what data we actually have in call_events
  const events = await client.query(`
    SELECT
      event_type,
      metadata->>'lead_id' as lead_id,
      metadata->>'agent_name' as agent_name,
      metadata->>'agent_email' as agent_email,
      metadata->>'agent_id' as agent_id,
      metadata->>'call_id' as call_id,
      metadata->>'convoso_call_id' as convoso_call_id,
      metadata->>'recording_url' as recording_url,
      metadata->>'disposition' as disposition,
      metadata->>'duration' as duration,
      created_at
    FROM call_events
    WHERE event_type IN ('webhook_received', 'lead_webhook_received')
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log('Sample webhook data received (last 10):');
  events.rows.forEach((row, i) => {
    console.log(`\n${i + 1}. ${row.event_type} at ${row.created_at}`);
    console.log(`   Lead ID: ${row.lead_id}`);
    console.log(`   Agent: ${row.agent_name} (${row.agent_email || 'no email'})`);
    console.log(`   Call ID: ${row.call_id || 'none'}`);
    console.log(`   Convoso Call ID: ${row.convoso_call_id || 'none'}`);
    console.log(`   Recording: ${row.recording_url ? 'YES' : 'NO'}`);
    console.log(`   Disposition: ${row.disposition || 'none'}`);
    console.log(`   Duration: ${row.duration || 'none'}`);
  });

  // Check unique combinations
  const combinations = await client.query(`
    SELECT
      metadata->>'lead_id' as lead_id,
      metadata->>'agent_name' as agent_name,
      COUNT(*) as event_count
    FROM call_events
    WHERE event_type IN ('webhook_received', 'lead_webhook_received')
      AND metadata->>'lead_id' IS NOT NULL
      AND metadata->>'agent_name' IS NOT NULL
    GROUP BY metadata->>'lead_id', metadata->>'agent_name'
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `);

  console.log('\n=== MULTIPLE EVENTS FOR SAME LEAD+AGENT ===');
  console.log('(Shows if multiple agents talked to same lead)');
  combinations.rows.forEach(row => {
    console.log(`Lead ${row.lead_id} + Agent ${row.agent_name}: ${row.event_count} events`);
  });

  // Check if we have any recordings stored
  const recordings = await client.query(`
    SELECT COUNT(*) as count,
           COUNT(DISTINCT agent_name) as unique_agents,
           COUNT(DISTINCT lead_id) as unique_leads,
           COUNT(recording_url) as has_recording
    FROM calls
    WHERE source = 'convoso'
  `);

  console.log('\n=== RECORDING STATS ===');
  console.log(`Total calls: ${recordings.rows[0].count}`);
  console.log(`Unique agents: ${recordings.rows[0].unique_agents}`);
  console.log(`Unique leads: ${recordings.rows[0].unique_leads}`);
  console.log(`Has recording URL: ${recordings.rows[0].has_recording}`);

  // Check if same lead has multiple agents
  const multiAgent = await client.query(`
    SELECT lead_id,
           COUNT(DISTINCT agent_name) as agent_count,
           array_agg(DISTINCT agent_name) as agents
    FROM calls
    WHERE source = 'convoso'
      AND lead_id IS NOT NULL
      AND agent_name IS NOT NULL
    GROUP BY lead_id
    HAVING COUNT(DISTINCT agent_name) > 1
    LIMIT 5
  `);

  console.log('\n=== LEADS WITH MULTIPLE AGENTS ===');
  if (multiAgent.rows.length > 0) {
    multiAgent.rows.forEach(row => {
      console.log(`Lead ${row.lead_id}: ${row.agent_count} agents - ${row.agents.join(', ')}`);
    });
  } else {
    console.log('No leads found with multiple agents');
  }

  await client.end();
})().catch(console.error);