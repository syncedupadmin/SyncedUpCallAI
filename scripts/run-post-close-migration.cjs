/**
 * Run Post Close Compliance Migration
 *
 * This script runs the post-close compliance system database migration.
 *
 * Usage: node scripts/run-post-close-migration.js
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigration() {
  console.log('🚀 Starting Post Close Compliance Migration...\n');

  // Check for DATABASE_URL
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL not found in .env.local');
    console.log('\nPlease set DATABASE_URL in your .env.local file.');
    process.exit(1);
  }

  // Read migration file
  const migrationPath = path.join(__dirname, '../supabase/migrations/add-post-close-compliance.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Error: Migration file not found at ${migrationPath}`);
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  console.log('✓ Migration file loaded');
  console.log(`  Path: ${migrationPath}`);
  console.log(`  Size: ${(migrationSQL.length / 1024).toFixed(1)} KB\n`);

  // Create database connection
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('supabase') ? {
      rejectUnauthorized: false
    } : undefined
  });

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('✓ Database connection successful\n');

    // Run migration
    console.log('📝 Running migration...');
    await pool.query(migrationSQL);
    console.log('✓ Migration completed successfully!\n');

    // Verify tables were created
    const tableCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'post_close%'
      ORDER BY table_name
    `);

    console.log('✓ Tables created:');
    tableCheck.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    console.log('\n🎉 Post Close Compliance System deployed successfully!');
    console.log('\nNext steps:');
    console.log('1. Navigate to /admin/post-close');
    console.log('2. Upload your post-close script in the Scripts tab');
    console.log('3. Activate the script');
    console.log('4. Click "Analyze Recent Sales Calls" to start checking compliance\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
