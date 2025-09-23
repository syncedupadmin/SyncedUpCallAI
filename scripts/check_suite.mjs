import {Client} from 'pg';
const c = new Client({connectionString: process.env.DATABASE_URL});
await c.connect();
const r = await c.query('select * from ai_test_runs where suite_run_id=$1 order by created_at desc', ['0de273b0-463a-4eae-a6da-812b014e5e31']);
console.log('Test runs for latest suite:', r.rows.length);
r.rows.forEach(row => console.log('  Status:', row.status, 'WER:', row.transcript_wer, 'Error:', row.error_message?.substring(0,50)));
await c.end();