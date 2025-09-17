const pg = require('pg');

async function checkTableStructure() {
  const pool = new pg.Pool({
    connectionString: "postgresql://postgres.sbvxvheirbjwfbqjreor:asDcj166oWnzXghR@aws-1-us-east-2.pooler.supabase.com:6543/postgres?workaround=supabase-pooler.vercel",
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('=== CHECKING TABLE STRUCTURE FOR BULK UPLOAD ===\n');

    // 1. Check calls table columns
    console.log('1. Calls table structure:');
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'calls'
      ORDER BY ordinal_position
    `);
    console.table(columns.rows.map(c => ({
      column: c.column_name,
      type: c.data_type,
      nullable: c.is_nullable,
      default: c.column_default ? c.column_default.substring(0, 30) : null
    })));

    // 2. Check for source_ref unique constraint
    console.log('\n2. Checking constraints on calls table:');
    const constraints = await pool.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'calls'
    `);
    console.table(constraints.rows);

    // 3. Check if source_ref has unique index
    console.log('\n3. Indexes on calls table:');
    const indexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'calls'
    `);
    indexes.rows.forEach(idx => {
      console.log(`- ${idx.indexname}: ${idx.indexdef.substring(0, 100)}`);
    });

    // 4. Check contacts table structure
    console.log('\n4. Contacts table structure:');
    const contactColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'contacts'
      ORDER BY ordinal_position
      LIMIT 10
    `);
    console.table(contactColumns.rows);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkTableStructure();