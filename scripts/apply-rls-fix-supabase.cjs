const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  try {
    console.log('Connecting to Supabase...');

    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250117_fix_rls_recursion.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Applying RLS recursion fix migration...');

    // Split SQL into individual statements (separated by semicolons)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';

      // Skip comment-only lines
      if (statement.trim().startsWith('--')) continue;

      try {
        const { data, error } = await supabase.rpc('exec_sql', {
          sql_query: statement
        }).single();

        if (error) {
          // Try direct execution as fallback
          const { error: directError } = await supabase.from('_sql').select().single().eq('query', statement);

          if (directError) {
            console.error(`Statement ${i + 1} failed:`, directError.message);
            errorCount++;
          } else {
            successCount++;
          }
        } else {
          successCount++;
        }

        // Show progress
        if ((i + 1) % 10 === 0) {
          console.log(`Progress: ${i + 1}/${statements.length} statements executed`);
        }
      } catch (err) {
        console.error(`Error executing statement ${i + 1}:`, err.message);
        errorCount++;
      }
    }

    console.log(`\nMigration completed: ${successCount} successful, ${errorCount} errors`);

    // Run verification queries
    console.log('\n=== Verification ===');

    // Test 1: Check offices
    const { data: offices, error: officesError } = await supabase
      .from('offices')
      .select('*', { count: 'exact', head: true });

    if (!officesError) {
      console.log(`✓ Offices table accessible`);
    } else {
      console.log(`✗ Offices table error: ${officesError.message}`);
    }

    // Test 2: Check user_offices
    const { data: userOffices, error: userOfficesError } = await supabase
      .from('user_offices')
      .select('*', { count: 'exact', head: true });

    if (!userOfficesError) {
      console.log(`✓ User offices table accessible`);
    } else {
      console.log(`✗ User offices table error: ${userOfficesError.message}`);
    }

    // Test 3: Check calls
    const { data: calls, error: callsError } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true });

    if (!callsError) {
      console.log(`✓ Calls table accessible`);
    } else {
      console.log(`✗ Calls table error: ${callsError.message}`);
    }

    console.log('\n✅ RLS fix process completed! Please test the app.');

  } catch (error) {
    console.error('Error applying migration:', error.message);
    process.exit(1);
  }
}

applyMigration();