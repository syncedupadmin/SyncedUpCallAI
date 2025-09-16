import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
dotenv.config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

const LEAD_ID = '10393511';

async function createCallsForRecordings() {
  await client.connect();

  console.log('=== CREATING CALL RECORDS FOR LEAD 10393511 ===\n');

  // The 3 recordings we found:
  const recordings = [
    {
      recording_id: '39550491',
      start_time: '2025-09-15T12:51:54Z',
      duration: 0.08,
      agent_name: 'Agent 1'
    },
    {
      recording_id: '39551357',
      start_time: '2025-09-15T12:56:50Z',
      duration: 5.35,
      agent_name: 'Agent 2'
    },
    {
      recording_id: '39552403',
      start_time: '2025-09-15T13:02:12Z',
      duration: 33.67,
      agent_name: 'Agent 3'
    }
  ];

  for (const rec of recordings) {
    try {
      // Calculate end time
      const startTime = new Date(rec.start_time);
      const endTime = new Date(startTime.getTime() + (rec.duration * 1000));

      // Generate fingerprint
      const fingerprint = `${LEAD_ID}_${rec.agent_name.toLowerCase()}_${startTime.toISOString().split('.')[0]}_${Math.round(rec.duration)}`;

      console.log(`Creating call for recording ${rec.recording_id}...`);
      console.log(`  Start: ${rec.start_time}`);
      console.log(`  Duration: ${rec.duration}s`);
      console.log(`  Fingerprint: ${fingerprint}`);

      const result = await client.query(`
        INSERT INTO calls (
          id,
          source,
          source_ref,
          lead_id,
          agent_name,
          started_at,
          ended_at,
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
          $4,
          $5,
          $6,
          $7,
          $8,
          NOW()
        )
        ON CONFLICT (source_ref) DO UPDATE SET
          lead_id = EXCLUDED.lead_id,
          updated_at = NOW()
        RETURNING id
      `, [
        `convoso-${rec.recording_id}`,  // source_ref
        LEAD_ID,                         // lead_id
        rec.agent_name,                  // agent_name
        startTime.toISOString(),         // started_at
        endTime.toISOString(),           // ended_at
        Math.round(rec.duration),        // duration_sec
        fingerprint,                     // recording_fingerprint
        JSON.stringify({                 // metadata
          recording_id: rec.recording_id,
          created_for_testing: true,
          created_at: new Date().toISOString()
        })
      ]);

      console.log(`  ✅ Created call with ID: ${result.rows[0].id}\n`);

    } catch (error) {
      console.log(`  ❌ Error creating call: ${error.message}\n`);
    }
  }

  // Verify the calls were created
  console.log('Verifying calls were created...');
  const verification = await client.query(`
    SELECT
      id,
      lead_id,
      agent_name,
      started_at,
      duration_sec,
      recording_fingerprint
    FROM calls
    WHERE lead_id = $1
    ORDER BY started_at
  `, [LEAD_ID]);

  console.log(`\n✅ Created ${verification.rows.length} call records for lead ${LEAD_ID}:`);
  verification.rows.forEach((call, i) => {
    console.log(`  ${i + 1}. Agent: ${call.agent_name}, Duration: ${call.duration_sec}s`);
  });

  await client.end();

  console.log('\n=== CALLS CREATED SUCCESSFULLY ===\n');
  console.log('📝 NOW YOU CAN:');
  console.log('1. Go to /test-smart-recordings');
  console.log('2. Enter Lead ID: 10393511');
  console.log('3. Uncheck "Dry Run"');
  console.log('4. Click "Test Smart Matching"');
  console.log('\nThe system will now match the 3 recordings to these call records!');
  console.log('\nOr check /admin/calls to see the new call records');
}

createCallsForRecordings().catch(console.error);