const pg = require('pg');

async function checkRecentWebhooks() {
  const pool = new pg.Pool({
    connectionString: "postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel",
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('=== WEBHOOK DATA VERIFICATION ===\n');

    // 1. Check webhook_logs table structure and recent activity
    console.log('1. Recent webhook activity (last 7 days):');
    const webhookLogs = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total_webhooks,
        COUNT(CASE WHEN response_status = 200 THEN 1 END) as successful,
        COUNT(CASE WHEN response_status != 200 OR response_status IS NULL THEN 1 END) as failed
      FROM webhook_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    console.table(webhookLogs.rows);

    // 2. Check recent webhook endpoints hit
    console.log('\n2. Webhook endpoints hit recently:');
    const endpoints = await pool.query(`
      SELECT
        endpoint,
        COUNT(*) as count,
        MAX(created_at) as last_hit
      FROM webhook_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY endpoint
      ORDER BY count DESC
    `);
    console.table(endpoints.rows);

    // 3. Check calls created in last 24 hours with complete data
    console.log('\n3. Calls created in last 24 hours:');
    const recentCalls = await pool.query(`
      SELECT
        DATE(created_at) as date,
        source,
        COUNT(*) as total,
        COUNT(CASE WHEN agent_name IS NOT NULL THEN 1 END) as with_agent,
        COUNT(CASE WHEN phone_number IS NOT NULL THEN 1 END) as with_phone,
        COUNT(CASE WHEN started_at IS NOT NULL THEN 1 END) as with_start_time,
        COUNT(CASE WHEN duration_sec IS NOT NULL THEN 1 END) as with_duration
      FROM calls
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY DATE(created_at), source
      ORDER BY date DESC, source
    `);
    console.table(recentCalls.rows);

    // 4. Check if the webhook validation is blocking calls
    console.log('\n4. Sample of most recent webhook logs (check for errors):');
    const recentLogs = await pool.query(`
      SELECT
        id,
        endpoint,
        response_status,
        error,
        created_at,
        body::text as body_preview
      FROM webhook_logs
      ORDER BY created_at DESC
      LIMIT 5
    `);

    recentLogs.rows.forEach(log => {
      console.log(`\n[${log.created_at}] ${log.endpoint}`);
      console.log(`Status: ${log.response_status || 'PENDING'}, Error: ${log.error || 'none'}`);
      if (log.body_preview) {
        try {
          const body = JSON.parse(log.body_preview);
          console.log('Body fields:', Object.keys(body).join(', '));
        } catch (e) {
          console.log('Body: [non-JSON]');
        }
      }
    });

    // 5. Check calls table for source distribution
    console.log('\n5. Call sources distribution:');
    const sources = await pool.query(`
      SELECT
        source,
        COUNT(*) as total,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '1 day' THEN 1 END) as last_24h,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as last_7d
      FROM calls
      GROUP BY source
      ORDER BY total DESC
    `);
    console.table(sources.rows);

    // 6. Check if there's a mismatch between webhook logs and calls
    console.log('\n6. Webhook to Call conversion rate:');
    const conversion = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM webhook_logs WHERE endpoint LIKE '%convoso%' AND created_at >= NOW() - INTERVAL '24 hours') as webhooks_received,
        (SELECT COUNT(*) FROM calls WHERE source = 'convoso' AND created_at >= NOW() - INTERVAL '24 hours') as calls_created
    `);
    const rate = conversion.rows[0];
    console.log(`Webhooks received: ${rate.webhooks_received}`);
    console.log(`Calls created: ${rate.calls_created}`);
    if (rate.webhooks_received > 0) {
      console.log(`Conversion rate: ${((rate.calls_created / rate.webhooks_received) * 100).toFixed(1)}%`);
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkRecentWebhooks();