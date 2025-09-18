const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSuperAdminPortal() {
  console.log('=== SUPER ADMIN PORTAL TEST REPORT ===\n');

  const results = {
    working: [],
    issues: [],
    warnings: []
  };

  // 1. Test convoso_control_settings table
  console.log('1. Testing convoso_control_settings table...');
  try {
    const { data, error } = await supabase
      .from('convoso_control_settings')
      .select('*')
      .limit(1);

    if (error) {
      results.issues.push({
        component: 'Database - convoso_control_settings',
        error: error.message,
        fix: 'Run migration: supabase/migrations/20250918_convoso_control_settings.sql'
      });
    } else {
      results.working.push('✅ convoso_control_settings table exists');

      // Check if default row exists
      if (!data || data.length === 0) {
        results.warnings.push({
          component: 'convoso_control_settings',
          message: 'No default settings found',
          fix: 'Insert default row into convoso_control_settings'
        });
      } else {
        results.working.push('✅ Default control settings found');
      }
    }
  } catch (err) {
    results.issues.push({
      component: 'Database Connection',
      error: err.message
    });
  }

  // 2. Test sync_state table
  console.log('2. Testing sync_state table...');
  try {
    const { data, error } = await supabase
      .from('sync_state')
      .select('*')
      .eq('key', 'last_convoso_check')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      results.issues.push({
        component: 'Database - sync_state',
        error: error.message
      });
    } else {
      results.working.push('✅ sync_state table accessible');
    }
  } catch (err) {
    results.issues.push({
      component: 'sync_state',
      error: err.message
    });
  }

  // 3. Test transcription_queue table
  console.log('3. Testing transcription_queue table...');
  try {
    const { count, error } = await supabase
      .from('transcription_queue')
      .select('*', { count: 'exact', head: true });

    if (error) {
      results.issues.push({
        component: 'Database - transcription_queue',
        error: error.message
      });
    } else {
      results.working.push(`✅ transcription_queue table exists (${count || 0} items)`);
    }
  } catch (err) {
    results.issues.push({
      component: 'transcription_queue',
      error: err.message
    });
  }

  // 4. Test calls table
  console.log('4. Testing calls table...');
  try {
    const { count, error } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .limit(1);

    if (error) {
      results.issues.push({
        component: 'Database - calls',
        error: error.message
      });
    } else {
      results.working.push(`✅ calls table accessible (${count || 0} total calls)`);
    }
  } catch (err) {
    results.issues.push({
      component: 'calls table',
      error: err.message
    });
  }

  // 5. Test RPC function is_super_admin
  console.log('5. Testing is_super_admin RPC function...');
  try {
    // This will fail without auth but we can check if the function exists
    const { error } = await supabase.rpc('is_super_admin');

    if (error && error.message.includes('JWT')) {
      results.working.push('✅ is_super_admin RPC function exists (auth required)');
    } else if (error) {
      results.issues.push({
        component: 'RPC - is_super_admin',
        error: error.message,
        fix: 'Ensure is_super_admin function is created in database'
      });
    } else {
      results.working.push('✅ is_super_admin RPC function accessible');
    }
  } catch (err) {
    results.issues.push({
      component: 'RPC function',
      error: err.message
    });
  }

  // Print Report
  console.log('\n' + '='.repeat(50));
  console.log('SUPER ADMIN PORTAL TEST REPORT');
  console.log('='.repeat(50) + '\n');

  console.log('✅ WORKING FEATURES:');
  results.working.forEach(item => console.log('  ' + item));

  if (results.issues.length > 0) {
    console.log('\n❌ ISSUES FOUND:');
    results.issues.forEach(issue => {
      console.log(`\n  Component: ${issue.component}`);
      console.log(`  Error: ${issue.error}`);
      if (issue.fix) {
        console.log(`  Fix: ${issue.fix}`);
      }
    });
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️ WARNINGS:');
    results.warnings.forEach(warning => {
      console.log(`\n  Component: ${warning.component}`);
      console.log(`  Message: ${warning.message}`);
      if (warning.fix) {
        console.log(`  Fix: ${warning.fix}`);
      }
    });
  }

  console.log('\n📊 SUMMARY:');
  console.log(`  Working: ${results.working.length}`);
  console.log(`  Issues: ${results.issues.length}`);
  console.log(`  Warnings: ${results.warnings.length}`);

  const healthPercentage = (results.working.length / (results.working.length + results.issues.length)) * 100;
  console.log(`  Overall Health: ${healthPercentage.toFixed(0)}%`);

  // Check environment variables
  console.log('\n🔧 ENVIRONMENT VARIABLES:');
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'CONVOSO_AUTH_TOKEN',
    'CRON_SECRET'
  ];

  requiredEnvVars.forEach(varName => {
    const exists = !!process.env[varName];
    console.log(`  ${varName}: ${exists ? '✅ Set' : '❌ Missing'}`);
  });

  // Check archived files
  console.log('\n📦 ARCHIVED FILES STATUS:');
  const fs = require('fs');
  const path = require('path');

  const archivedPath = path.join(__dirname, 'archived');
  if (fs.existsSync(archivedPath)) {
    const archivedDirs = fs.readdirSync(archivedPath);
    console.log(`  Found ${archivedDirs.length} archived directories:`);
    archivedDirs.forEach(dir => {
      const files = fs.readdirSync(path.join(archivedPath, dir));
      console.log(`    - ${dir}/ (${files.length} files)`);
    });
  } else {
    console.log('  No archived directory found');
  }

  console.log('\n' + '='.repeat(50));

  if (results.issues.length === 0) {
    console.log('✅ SUPER ADMIN PORTAL IS FULLY OPERATIONAL!');
  } else {
    console.log('⚠️ SUPER ADMIN PORTAL HAS ISSUES THAT NEED ATTENTION');
  }

  process.exit(results.issues.length === 0 ? 0 : 1);
}

testSuperAdminPortal().catch(console.error);