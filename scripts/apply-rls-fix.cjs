const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.production' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function applyMigration() {
  const client = await pool.connect();

  try {
    console.log('Connected to database');

    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250117_fix_rls_recursion.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Applying RLS recursion fix migration...');

    // Execute the migration
    await client.query(migrationSQL);

    console.log('Migration applied successfully!');

    // Run verification queries
    console.log('\n=== Verification ===');

    // Test 1: Check offices
    const officesResult = await client.query('SELECT COUNT(*) FROM public.offices');
    console.log(`✓ Offices table accessible: ${officesResult.rows[0].count} offices found`);

    // Test 2: Check user_offices
    const userOfficesResult = await client.query('SELECT COUNT(*) FROM public.user_offices');
    console.log(`✓ User offices table accessible: ${userOfficesResult.rows[0].count} memberships found`);

    // Test 3: Check calls
    const callsResult = await client.query('SELECT COUNT(*) FROM public.calls LIMIT 10');
    console.log(`✓ Calls table accessible: ${callsResult.rows[0].count} calls found`);

    // Test 4: Check policies
    const policiesResult = await client.query(`
      SELECT tablename, COUNT(*) as policy_count
      FROM pg_policies
      WHERE tablename IN ('offices', 'user_offices', 'calls', 'contacts', 'webhook_logs')
      GROUP BY tablename
      ORDER BY tablename
    `);

    console.log('\n=== Policies Created ===');
    policiesResult.rows.forEach(row => {
      console.log(`  ${row.tablename}: ${row.policy_count} policies`);
    });

    console.log('\n✅ RLS fix applied successfully! The app should now be functional.');

  } catch (error) {
    console.error('Error applying migration:', error.message);
    if (error.detail) console.error('Detail:', error.detail);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();