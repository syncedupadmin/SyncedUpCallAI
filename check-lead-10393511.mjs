import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
dotenv.config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

const LEAD_ID = '10393511';

async function checkLead() {
  await client.connect();

  console.log('=== CHECKING LEAD 10393511 IN DATABASE ===\n');

  // 1. Check if any calls exist for this lead
  console.log('1. Checking CALLS table for lead_id = 10393511...');
  const callsByLeadId = await client.query(`
    SELECT
      id,
      lead_id,
      source_ref,
      agent_name,
      agent_email,
      recording_url,
      recording_match_confidence,
      started_at,
      duration_sec,
      created_at
    FROM calls
    WHERE lead_id = $1 OR source_ref = $1
    ORDER BY created_at DESC
  `, [LEAD_ID]);

  if (callsByLeadId.rows.length > 0) {
    console.log(`✅ Found ${callsByLeadId.rows.length} calls for lead ${LEAD_ID}:`);
    callsByLeadId.rows.forEach((call, i) => {
      console.log(`\nCall ${i + 1}:`);
      console.log(`  ID: ${call.id}`);
      console.log(`  Lead ID: ${call.lead_id}`);
      console.log(`  Source Ref: ${call.source_ref}`);
      console.log(`  Agent: ${call.agent_name || 'None'}`);
      console.log(`  Recording: ${call.recording_url ? 'YES' : 'NO'}`);
      console.log(`  Confidence: ${call.recording_match_confidence || 'None'}`);
      console.log(`  Started: ${call.started_at}`);
      console.log(`  Duration: ${call.duration_sec}s`);
      console.log(`  Created: ${call.created_at}`);
    });
  } else {
    console.log(`❌ No calls found for lead ${LEAD_ID}`);
  }

  // 2. Check if lead exists in any form
  console.log('\n2. Checking all tables for any reference to 10393511...');

  // Check calls with LIKE search
  const callsLike = await client.query(`
    SELECT COUNT(*) as count
    FROM calls
    WHERE
      lead_id::text LIKE '%10393511%'
      OR source_ref::text LIKE '%10393511%'
      OR metadata::text LIKE '%10393511%'
  `);
  console.log(`  Calls table (partial match): ${callsLike.rows[0].count} records`);

  // Check unmatched_recordings
  const unmatchedCheck = await client.query(`
    SELECT COUNT(*) as count
    FROM unmatched_recordings
    WHERE lead_id = $1
  `, [LEAD_ID]);
  console.log(`  Unmatched recordings: ${unmatchedCheck.rows[0].count} records`);

  // 3. Check recent calls to see what's being saved
  console.log('\n3. Last 5 calls in database (any lead):');
  const recentCalls = await client.query(`
    SELECT
      id,
      lead_id,
      source_ref,
      agent_name,
      source,
      created_at
    FROM calls
    ORDER BY created_at DESC
    LIMIT 5
  `);

  if (recentCalls.rows.length > 0) {
    recentCalls.rows.forEach((call, i) => {
      console.log(`  ${i + 1}. Lead: ${call.lead_id || call.source_ref}, Agent: ${call.agent_name || 'None'}, Source: ${call.source}, Created: ${call.created_at}`);
    });
  } else {
    console.log('  No calls in database');
  }

  // 4. Check if the smart test actually created records
  console.log('\n4. Checking for test records created today:');
  const todayTests = await client.query(`
    SELECT
      id,
      lead_id,
      agent_name,
      recording_url,
      recording_match_confidence,
      created_at
    FROM calls
    WHERE
      created_at > NOW() - INTERVAL '1 hour'
      AND (
        agent_name LIKE '%Test%'
        OR agent_name LIKE '%test%'
        OR metadata::text LIKE '%test_run%'
      )
    ORDER BY created_at DESC
    LIMIT 10
  `);

  if (todayTests.rows.length > 0) {
    console.log(`✅ Found ${todayTests.rows.length} test records from last hour:`);
    todayTests.rows.forEach((call, i) => {
      console.log(`  ${i + 1}. Lead: ${call.lead_id}, Agent: ${call.agent_name}, Has Recording: ${!!call.recording_url}`);
    });
  } else {
    console.log('❌ No test records created in last hour');
  }

  // 5. Check database permissions
  console.log('\n5. Testing database write permissions...');
  try {
    // Try to insert a test record
    await client.query(`
      INSERT INTO calls (
        id,
        source,
        source_ref,
        lead_id,
        agent_name,
        started_at,
        duration_sec,
        created_at
      ) VALUES (
        gen_random_uuid(),
        'test',
        'TEST-PERMISSION-CHECK',
        'TEST-PERMISSION',
        'Permission Test Agent',
        NOW(),
        60,
        NOW()
      )
    `);

    // If insert worked, delete it
    await client.query(`
      DELETE FROM calls
      WHERE source_ref = 'TEST-PERMISSION-CHECK'
    `);

    console.log('✅ Database write permissions OK');
  } catch (error) {
    console.log('❌ Database write permission error:', error.message);
  }

  await client.end();

  console.log('\n=== DIAGNOSIS COMPLETE ===\n');
  console.log('📝 NEXT STEPS:');
  console.log('1. If no calls exist for 10393511, the test page may not be saving correctly');
  console.log('2. Check that "Dry Run" is definitely UNCHECKED');
  console.log('3. Try creating a webhook manually to test the flow');
  console.log('4. Check browser console for any JavaScript errors');
}

checkLead().catch(console.error);