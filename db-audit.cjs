const pg = require('pg');

async function audit() {
  const pool = new pg.Pool({
    connectionString: "postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel",
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('=== PHASE B: DATABASE AUDIT ===\n');

    // 1. List candidate functions
    console.log('1. Checking for RPC functions:');
    const funcs = await pool.query(`
      select n.nspname, p.proname,
             pg_get_function_identity_arguments(p.oid) args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname in ('create_agent_user','is_admin','is_super_admin', 'get_user_level', 'get_users_by_level_v2', 'set_admin_level')
      order by 1,2
    `);
    console.table(funcs.rows);

    // 2. Check table schemas
    console.log('\n2. Checking table schemas:');
    const schemas = await pool.query(`
      select table_name, column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema='public' and table_name in ('agents','user_profiles', 'profiles', 'admin_users')
      order by table_name, ordinal_position
    `);
    console.table(schemas.rows);

    // 3. Check if create_agent_user exists
    console.log('\n3. Checking create_agent_user function:');
    const createAgentFunc = await pool.query(`
      select proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and proname = 'create_agent_user'
    `);

    if (createAgentFunc.rows.length === 0) {
      console.log('❌ create_agent_user function NOT FOUND - needs to be created');
    } else {
      console.log('✓ create_agent_user found:', createAgentFunc.rows[0]);
    }

    // 4. Check admin functions
    console.log('\n4. Checking admin validation functions:');
    const adminFuncs = await pool.query(`
      select proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and proname in ('is_admin','is_super_admin')
    `);
    console.table(adminFuncs.rows);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

audit();