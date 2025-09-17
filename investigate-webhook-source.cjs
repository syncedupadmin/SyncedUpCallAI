const pg = require('pg');

async function investigateWebhookSource() {
  const pool = new pg.Pool({
    connectionString: "postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel",
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('=== INVESTIGATING WEBHOOK SOURCE ISSUE ===\n');

    // 1. Check what's creating these 51,603 webhook source calls
    console.log('1. Sample of "webhook" source calls (should be "convoso"):');
    const webhookSourceCalls = await pool.query(`
      SELECT
        id,
        source,
        source_ref,
        agent_name,
        phone_number,
        started_at,
        duration_sec,
        created_at,
        metadata::text as metadata_preview
      FROM calls
      WHERE source = 'webhook'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('\nSample webhook source calls:');
    webhookSourceCalls.rows.forEach(call => {
      console.log(`\nID: ${call.id}`);
      console.log(`Created: ${call.created_at}`);
      console.log(`Source: ${call.source}, Ref: ${call.source_ref || 'NULL'}`);
      console.log(`Agent: ${call.agent_name || 'NULL'}, Phone: ${call.phone_number || 'NULL'}`);
      console.log(`Start: ${call.started_at || 'NULL'}, Duration: ${call.duration_sec || 'NULL'}`);
      if (call.metadata_preview) {
        console.log(`Metadata: ${call.metadata_preview.substring(0, 100)}...`);
      }
    });

    // 2. Check the calls table schema
    console.log('\n2. Checking calls table columns:');
    const columns = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'calls'
      AND column_name IN ('source', 'source_ref', 'id')
      ORDER BY ordinal_position
    `);
    console.table(columns.rows);

    // 3. Check if there's another webhook endpoint creating these
    console.log('\n3. Finding what created the bulk "webhook" source entries:');
    const bulkTiming = await pool.query(`
      SELECT
        source,
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as count
      FROM calls
      WHERE source = 'webhook'
        AND created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY source, hour
      ORDER BY hour DESC
      LIMIT 5
    `);
    console.table(bulkTiming.rows);

    // 4. Check if convoso webhook is setting source correctly
    console.log('\n4. Verifying convoso webhook source setting:');
    const convosoSourceCheck = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN source = 'convoso' THEN 1 END) as correct_source,
        COUNT(CASE WHEN source = 'webhook' THEN 1 END) as wrong_source,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM calls
      WHERE created_at >= NOW() - INTERVAL '1 hour'
    `);
    console.table(convosoSourceCheck.rows);

    // 5. Check for duplicate entries
    console.log('\n5. Checking for duplicate call IDs:');
    const duplicates = await pool.query(`
      SELECT
        source_ref,
        COUNT(*) as count,
        array_agg(DISTINCT source) as sources
      FROM calls
      WHERE source_ref IS NOT NULL
      GROUP BY source_ref
      HAVING COUNT(*) > 1
      LIMIT 5
    `);
    console.table(duplicates.rows);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

investigateWebhookSource();