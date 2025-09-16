import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
dotenv.config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

const LEAD_ID = '10393511';

async function createCallsSimple() {
  await client.connect();

  console.log('=== CREATING CALL RECORDS FOR LEAD 10393511 ===\n');

  // The 3 recordings we found - matching the exact times
  const recordings = [
    {
      recording_id: '39550491',
      start_time: '2025-09-15 12:51:54',  // Exact time from Convoso
      duration: 0,  // Round to 0 seconds
      agent_name: 'Agent 1'
    },
    {
      recording_id: '39551357',
      start_time: '2025-09-15 12:56:50',  // Exact time from Convoso
      duration: 5,  // 5.35 seconds rounded
      agent_name: 'Agent 2'
    },
    {
      recording_id: '39552403',
      start_time: '2025-09-15 13:02:12',  // Exact time from Convoso
      duration: 34,  // 33.67 seconds rounded
      agent_name: 'Agent 3'
    }
  ];

  for (const rec of recordings) {
    try {
      // Simple insert without ON CONFLICT
      console.log(`Creating call for recording ${rec.recording_id}...`);

      const result = await client.query(`
        INSERT INTO calls (
          id,
          source,
          source_ref,
          lead_id,
          agent_name,
          started_at,
          duration_sec,
          recording_fingerprint,
          metadata,
          created_at
        ) VALUES (
          gen_random_uuid(),
          'convoso',
          $1,
          $2,
          $3,
          $4::timestamp,
          $5,
          $6,
          $7,
          NOW()
        )
        RETURNING id
      `, [
        rec.recording_id,                // source_ref
        LEAD_ID,                         // lead_id
        rec.agent_name,                  // agent_name
        rec.start_time,                  // started_at
        rec.duration,                    // duration_sec
        `${LEAD_ID}_${rec.agent_name.toLowerCase().replace(' ', '_')}_${rec.start_time.replace(' ', 'T')}_${rec.duration}`,  // fingerprint
        JSON.stringify({                 // metadata
          recording_id: rec.recording_id,
          created_for_testing: true,
          created_at: new Date().toISOString()
        })
      ]);

      console.log(`  ✅ Created call with ID: ${result.rows[0].id}`);
      console.log(`     Start: ${rec.start_time}`);
      console.log(`     Duration: ${rec.duration}s\n`);

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}\n`);
    }
  }

  // Verify the calls were created
  console.log('=== VERIFYING CALLS ===');
  const verification = await client.query(`
    SELECT
      id,
      lead_id,
      source_ref,
      agent_name,
      started_at,
      duration_sec,
      recording_url,
      recording_fingerprint
    FROM calls
    WHERE lead_id = $1
    ORDER BY started_at DESC
  `, [LEAD_ID]);

  if (verification.rows.length > 0) {
    console.log(`\n✅ Found ${verification.rows.length} call records for lead ${LEAD_ID}:\n`);
    verification.rows.forEach((call, i) => {
      console.log(`Call ${i + 1}:`);
      console.log(`  ID: ${call.id}`);
      console.log(`  Agent: ${call.agent_name}`);
      console.log(`  Source Ref: ${call.source_ref}`);
      console.log(`  Start: ${call.started_at}`);
      console.log(`  Duration: ${call.duration_sec}s`);
      console.log(`  Has Recording: ${call.recording_url ? 'YES' : 'NO'}`);
      console.log(`  Fingerprint: ${call.recording_fingerprint}`);
      console.log('');
    });
  } else {
    console.log(`❌ No calls found for lead ${LEAD_ID}`);
  }

  await client.end();

  console.log('=== NEXT STEPS ===\n');
  console.log('1. Go to your Vercel site: /admin/calls');
  console.log('   - You should see 3 calls for lead 10393511\n');
  console.log('2. Go to: /test-smart-recordings');
  console.log('   - Enter Lead ID: 10393511');
  console.log('   - UNCHECK "Dry Run"');
  console.log('   - Click "Test Smart Matching"\n');
  console.log('3. The system will match the recordings to these calls!');
  console.log('   - Recording 39550491 → Agent 1 (0s)');
  console.log('   - Recording 39551357 → Agent 2 (5s)');
  console.log('   - Recording 39552403 → Agent 3 (34s)');
}

createCallsSimple().catch(console.error);