import { Client } from "pg";

const DB = process.env.DATABASE_URL;

const client = new Client({ connectionString: DB });
await client.connect();

console.log('Creating ai_transcription_jobs table...\n');

try {
  // Create the jobs table
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_transcription_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      suite_run_id UUID NOT NULL REFERENCES ai_suite_runs(id) ON DELETE CASCADE,
      test_run_id UUID NOT NULL REFERENCES ai_test_runs(id) ON DELETE CASCADE,
      call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
      audio_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
      attempts INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  console.log('✅ Table created successfully');

  // Add indexes for performance
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_jobs_status
    ON ai_transcription_jobs(status)
    WHERE status IN ('queued', 'processing')
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_jobs_suite_run
    ON ai_transcription_jobs(suite_run_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_jobs_call
    ON ai_transcription_jobs(call_id)
  `);

  console.log('✅ Indexes created successfully');

  // Check if table was created
  const result = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'ai_transcription_jobs'
    ORDER BY ordinal_position
  `);

  console.log('\nTable schema:');
  result.rows.forEach(col => {
    console.log(`  ${col.column_name}: ${col.data_type}`);
  });

} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  await client.end();
}