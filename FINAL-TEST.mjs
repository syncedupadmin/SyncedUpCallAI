// FINAL TEST - Direct test bypassing bulk runner
import { Client } from "pg";

const DB = process.env.DATABASE_URL;
const JOBS_SECRET = process.env.JOBS_SECRET || 'dffrgvioervov554w8cwswiocvjsd';
const API_URL = 'https://synced-up-call-ai.vercel.app';
const SUITE_ID = '876b6b65-ddaa-42fe-aecd-80457cb66035';

async function finalTest() {
  const client = new Client({ connectionString: DB });
  await client.connect();

  console.log('=== FINAL DIRECT TEST ===\n');

  try {
    // 1. Get one test case
    const testCase = await client.query(
      'SELECT id, audio_url FROM ai_test_cases WHERE suite_id=$1 LIMIT 1',
      [SUITE_ID]
    );

    if (!testCase.rows.length) {
      console.log('❌ No test cases found');
      return;
    }

    const tc = testCase.rows[0];
    console.log('Test case:', tc.id);
    console.log('Audio URL:', tc.audio_url);

    // 2. Create test run
    const testRun = await client.query(
      "INSERT INTO ai_test_runs (test_case_id, status) VALUES ($1, 'running') RETURNING id",
      [tc.id]
    );
    const testRunId = testRun.rows[0].id;
    console.log('Test run created:', testRunId);

    // 3. Create call with all required fields
    const call = await client.query(
      `INSERT INTO calls (
        recording_url, duration_sec, office_id, agent_name,
        source, is_test, analyzed_at, created_at
      ) VALUES ($1, 30, 1, 'TEST', 'ai_test', true, NOW(), NOW())
      RETURNING id`,
      [tc.audio_url]
    );
    const callId = call.rows[0].id;
    console.log('Call created:', callId);

    // 4. Update test run with call_id
    await client.query(
      'UPDATE ai_test_runs SET call_id=$1 WHERE id=$2',
      [callId, testRunId]
    );

    // 5. Trigger transcription
    console.log('\nTriggering transcription...');
    const resp = await fetch(`${API_URL}/api/jobs/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JOBS_SECRET}`
      },
      body: JSON.stringify({
        callId,
        recordingUrl: tc.audio_url
      })
    });

    console.log('Transcribe response:', resp.status, resp.statusText);

    if (!resp.ok) {
      const text = await resp.text();
      console.log('Response body:', text);
      throw new Error(`Transcribe failed: ${resp.status}`);
    }

    // 6. Poll for transcript
    console.log('\nPolling for transcript...');
    const started = Date.now();
    let transcript = null;

    while (Date.now() - started < 60000) {
      const result = await client.query(
        'SELECT text FROM transcripts WHERE call_id=$1',
        [callId]
      );

      if (result.rows.length && result.rows[0].text) {
        transcript = result.rows[0].text;
        break;
      }

      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 2000));
    }

    if (transcript) {
      console.log('\n✅ SUCCESS! Transcript received:');
      console.log('  Length:', transcript.length, 'chars');
      console.log('  Preview:', transcript.substring(0, 100));

      // Update test run
      await client.query(
        "UPDATE ai_test_runs SET status='completed', actual_transcript=$1 WHERE id=$2",
        [transcript, testRunId]
      );
    } else {
      console.log('\n❌ Timeout waiting for transcript');
      await client.query(
        "UPDATE ai_test_runs SET status='failed', error_message='Timeout' WHERE id=$1",
        [testRunId]
      );
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

console.log('Starting final test in 3 seconds...');
setTimeout(() => finalTest().catch(console.error), 3000);