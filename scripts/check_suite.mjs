import {Client} from 'pg';
const c = new Client({connectionString: process.env.DATABASE_URL});
await c.connect();
const r = await c.query('select * from ai_test_runs where suite_run_id=$1 order by created_at desc', ['42bc6cb2-ddc1-41dd-910e-a042418e9a5e']);
console.log('Test runs for latest suite:', r.rows.length);
r.rows.forEach(row => console.log('  Status:', row.status, 'WER:', row.transcript_wer, 'Error:', row.error_message?.substring(0,50)));
await c.end();