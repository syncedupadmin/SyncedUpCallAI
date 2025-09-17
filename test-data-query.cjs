const pg = require('pg');

async function testDataQuery() {
  const pool = new pg.Pool({
    connectionString: "postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel",
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('=== DATA ACCURACY INVESTIGATION ===\n');

    // 1. Check total calls in database
    console.log('1. Checking total calls in database:');
    const totalCalls = await pool.query('SELECT COUNT(*) as total FROM calls');
    console.log('Total calls in database:', totalCalls.rows[0].total);

    // 2. Check calls by date
    console.log('\n2. Checking calls by date:');
    const callsByDate = await pool.query(`
      SELECT
        DATE(started_at) as date,
        COUNT(*) as count
      FROM calls
      WHERE started_at IS NOT NULL
      GROUP BY DATE(started_at)
      ORDER BY date DESC
      LIMIT 10
    `);
    console.table(callsByDate.rows);

    // 3. Check calls with missing data
    console.log('\n3. Checking data completeness:');
    const missingData = await pool.query(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(CASE WHEN agent_name IS NULL THEN 1 END) as missing_agent_name,
        COUNT(CASE WHEN phone_number IS NULL THEN 1 END) as missing_phone,
        COUNT(CASE WHEN started_at IS NULL THEN 1 END) as missing_start_time,
        COUNT(CASE WHEN duration_sec IS NULL THEN 1 END) as missing_duration
      FROM calls
    `);
    console.table(missingData.rows);

    // 4. Check leads data
    console.log('\n4. Checking leads data:');
    const leadsData = await pool.query(`
      SELECT
        COUNT(*) as total_leads,
        COUNT(DISTINCT lead_id) as unique_leads
      FROM calls
      WHERE lead_id IS NOT NULL
    `);
    console.table(leadsData.rows);

    // 5. Check agents data
    console.log('\n5. Checking agents data:');
    const agentsData = await pool.query(`
      SELECT
        COUNT(DISTINCT agent_id) as unique_agents,
        COUNT(DISTINCT agent_name) as unique_agent_names
      FROM calls
      WHERE agent_id IS NOT NULL OR agent_name IS NOT NULL
    `);
    console.table(agentsData.rows);

    // 6. Sample recent calls
    console.log('\n6. Sample of recent calls:');
    const recentCalls = await pool.query(`
      SELECT
        id,
        source,
        started_at,
        duration_sec,
        agent_name,
        phone_number,
        disposition
      FROM calls
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.table(recentCalls.rows);

    // 7. Check webhook logs
    console.log('\n7. Checking webhook logs:');
    const webhookLogs = await pool.query(`
      SELECT
        COUNT(*) as total_webhooks,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM webhook_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    console.table(webhookLogs.rows);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

testDataQuery();