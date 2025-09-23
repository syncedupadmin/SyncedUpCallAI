// FIX DATABASE SCHEMA AND CLEAR STUCK RUNS
const API_URL = 'https://synced-up-call-ai.vercel.app';
const ADMIN_SECRET = 'KzA/67epERD+JehE4eZsP+XksO14VQRgjgqb00tkLGo=';

async function fixDatabase() {
  console.log('=== FIXING DATABASE ===\n');

  // Step 1: Check current database status
  console.log('Checking database status...');
  const statusRes = await fetch(`${API_URL}/api/testing/fix-database`, {
    headers: { 'x-admin-secret': ADMIN_SECRET }
  });
  const status = await statusRes.json();

  console.log('\nCurrent Status:');
  console.log(`  Existing columns: ${status.database_status?.existing_columns?.join(', ') || 'none'}`);
  console.log(`  Missing columns: ${status.database_status?.missing_columns?.join(', ') || 'none'}`);
  console.log(`  Running tests: ${status.database_status?.running_tests || 0}`);
  console.log(`  Needs fix: ${status.database_status?.needs_fix ? 'YES' : 'NO'}`);

  if (!status.database_status?.needs_fix) {
    console.log('\n✅ Database is already fixed and ready!');
    return;
  }

  // Step 2: Apply fixes
  console.log('\n=== APPLYING FIXES ===');
  console.log('This will:');
  console.log('1. Add missing columns to calls table');
  console.log('2. Clear all stuck test runs');
  console.log('3. Verify database is ready for testing\n');

  const fixRes = await fetch(`${API_URL}/api/testing/fix-database`, {
    method: 'POST',
    headers: { 'x-admin-secret': ADMIN_SECRET }
  });

  const fixResult = await fixRes.json();

  if (fixResult.success) {
    console.log('✅ Database fixes applied successfully!\n');
    console.log('Results:');
    console.log(`  Columns verified: ${fixResult.fixes?.columns_verified?.join(', ')}`);
    console.log(`  Stuck suite runs cleared: ${fixResult.fixes?.stuck_suite_runs_cleared}`);
    console.log(`  Stuck test runs cleared: ${fixResult.fixes?.stuck_test_runs_cleared}`);
    console.log(`  Ready for testing: ${fixResult.ready_for_testing ? 'YES' : 'NO'}`);

    if (fixResult.ready_for_testing) {
      console.log('\n=== DATABASE READY ===');
      console.log('You can now run tests with:');
      console.log('  node RUN-ALL-TESTS.mjs');
    } else {
      console.log('\n⚠️ Additional fixes may be needed. Check the results above.');
    }
  } else {
    console.log('❌ Failed to apply fixes:', fixResult.error);
  }
}

// Run immediately
console.log('DATABASE FIX UTILITY');
console.log('='.repeat(50));
fixDatabase().catch(console.error);