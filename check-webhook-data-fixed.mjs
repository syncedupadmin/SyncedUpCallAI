import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
dotenv.config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

(async () => {
  await client.connect();

  console.log('=== CHECKING WEBHOOK DATA ===\n');

  // First check what tables and columns we have
  const tables = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('calls', 'call_events', 'webhook_logs')
    ORDER BY table_name, ordinal_position
  `);

  console.log('Available tables and columns:');
  let currentTable = '';
  tables.rows.forEach(row => {
    if (row.table_name !== currentTable) {
      currentTable = row.table_name;
      console.log(`\n${currentTable}:`);
    }
    console.log(`  - ${row.column_name}`);
  });

  // Check webhook_logs if it exists
  const hasWebhookLogs = tables.rows.some(r => r.table_name === 'webhook_logs');
  if (hasWebhookLogs) {
    const webhooks = await client.query(`
      SELECT
        id,
        source,
        payload,
        created_at
      FROM webhook_logs
      WHERE source = 'convoso'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log('\n=== RECENT WEBHOOK LOGS ===');
    webhooks.rows.forEach((row, i) => {
      console.log(`\n${i + 1}. Webhook at ${row.created_at}`);
      const data = row.payload;
      console.log(`   Lead ID: ${data.lead_id || data.LeadID || 'none'}`);
      console.log(`   Agent: ${data.agent_name || data.User || 'none'}`);
      console.log(`   Agent Email: ${data.agent_email || data.user_email || 'none'}`);
      console.log(`   Call ID: ${data.call_id || data.CallID || 'none'}`);
      console.log(`   Recording: ${data.recording_url ? 'YES' : 'NO'}`);
    });
  }

  // Check calls table
  const calls = await client.query(`
    SELECT
      id,
      source_ref as lead_id,
      agent_name,
      agent_email,
      recording_url,
      metadata,
      created_at
    FROM calls
    WHERE source = 'convoso'
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log('\n=== RECENT CALLS ===');
  calls.rows.forEach((row, i) => {
    console.log(`\n${i + 1}. Call at ${row.created_at}`);
    console.log(`   Lead ID: ${row.lead_id}`);
    console.log(`   Agent: ${row.agent_name || 'none'} (${row.agent_email || 'no email'})`);
    console.log(`   Recording URL: ${row.recording_url ? 'YES' : 'NO'}`);
    if (row.metadata) {
      console.log(`   Has metadata: YES`);
      if (row.metadata.call_id) console.log(`   Call ID in metadata: ${row.metadata.call_id}`);
      if (row.metadata.convoso_call_id) console.log(`   Convoso Call ID: ${row.metadata.convoso_call_id}`);
    }
  });

  // Check if same lead has multiple agents
  const multiAgent = await client.query(`
    SELECT
      source_ref as lead_id,
      COUNT(DISTINCT agent_name) as agent_count,
      array_agg(DISTINCT agent_name) as agents
    FROM calls
    WHERE source = 'convoso'
      AND source_ref IS NOT NULL
      AND agent_name IS NOT NULL
    GROUP BY source_ref
    HAVING COUNT(DISTINCT agent_name) > 1
    ORDER BY agent_count DESC
    LIMIT 10
  `);

  console.log('\n=== LEADS WITH MULTIPLE AGENTS ===');
  console.log(`Found ${multiAgent.rows.length} leads with multiple agents:`);
  if (multiAgent.rows.length > 0) {
    multiAgent.rows.forEach(row => {
      console.log(`\nLead ${row.lead_id}: ${row.agent_count} agents`);
      console.log(`  Agents: ${row.agents.join(', ')}`);
    });
  }

  // Summary stats
  const stats = await client.query(`
    SELECT
      COUNT(*) as total_calls,
      COUNT(DISTINCT source_ref) as unique_leads,
      COUNT(DISTINCT agent_name) as unique_agents,
      COUNT(recording_url) as has_recording,
      COUNT(DISTINCT CASE WHEN agent_name IS NOT NULL THEN source_ref END) as leads_with_agent
    FROM calls
    WHERE source = 'convoso'
  `);

  console.log('\n=== OVERALL STATS ===');
  const s = stats.rows[0];
  console.log(`Total calls: ${s.total_calls}`);
  console.log(`Unique leads: ${s.unique_leads}`);
  console.log(`Unique agents: ${s.unique_agents}`);
  console.log(`Calls with recordings: ${s.has_recording}`);
  console.log(`Leads with agent info: ${s.leads_with_agent}`);

  await client.end();
  process.exit(0);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});