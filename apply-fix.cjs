const pg = require('pg');
const fs = require('fs');

async function applyFix() {
  const pool = new pg.Pool({
    connectionString: "postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel",
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('=== PHASE C: APPLYING RPC FIX ===\n');

    const sql = fs.readFileSync('migrations/fix-create-agent-user.sql', 'utf8');

    console.log('Executing SQL migration...');
    await pool.query(sql);

    console.log('✅ Migration applied successfully\n');

    // Verify the new function
    console.log('Verifying function signatures:');
    const verify = await pool.query(`
      SELECT
        proname,
        pg_get_function_identity_arguments(p.oid) as signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND proname = 'create_agent_user'
    `);

    console.table(verify.rows);

  } catch (err) {
    console.error('❌ Error applying fix:', err.message);
    console.error('Details:', err);
  } finally {
    await pool.end();
  }
}

applyFix();