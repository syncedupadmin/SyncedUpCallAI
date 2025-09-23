import { Client } from "pg";

const DB = process.env.DATABASE_URL;

const client = new Client({ connectionString: DB });
await client.connect();

console.log('Adding unique index to prevent double-runs...\n');

try {
  // Add a partial unique index so nothing can accidentally double-run
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_suite_running
    ON ai_suite_runs (suite_id)
    WHERE status = 'running'
  `);

  console.log('✅ Unique index created successfully');
  console.log('   This prevents multiple concurrent runs for the same suite');

  // Verify the index was created
  const result = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'ai_suite_runs'
    AND indexname = 'ux_suite_running'
  `);

  if (result.rows.length > 0) {
    console.log('\nIndex definition:');
    console.log(result.rows[0].indexdef);
  }

} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  await client.end();
}