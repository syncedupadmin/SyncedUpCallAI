import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './src/server/db.ts';

console.log('========================================');
console.log('ADMIN & CONVOSO FUNCTIONALITY AUDIT');
console.log('========================================\n');

// Track test results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Helper functions
function pass(test) {
  console.log(`✅ ${test}`);
  results.passed.push(test);
}

function fail(test, error) {
  console.log(`❌ ${test}: ${error}`);
  results.failed.push({ test, error });
}

function warn(test) {
  console.log(`⚠️ ${test}`);
  results.warnings.push(test);
}

async function runAudit() {
  try {
    console.log('1. ADMIN AUTHENTICATION & ACCESS\n');
    console.log('----------------------------------------');

    // Check is_admin() function exists
    try {
      const fnCheck = await db.oneOrNone(`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_name = 'is_admin'
      `);

      if (fnCheck) {
        pass('is_admin() database function exists');
      } else {
        fail('is_admin() database function', 'Function not found');
      }
    } catch (error) {
      fail('is_admin() function check', error.message);
    }

    // Check admin_users table
    try {
      const adminCount = await db.one(`
        SELECT COUNT(*) as count
        FROM admin_users
      `);

      if (adminCount.count > 0) {
        pass(`admin_users table has ${adminCount.count} admin(s)`);

        // Check for specific admin
        const specificAdmin = await db.oneOrNone(`
          SELECT * FROM admin_users
          WHERE email = 'admin@syncedupsolutions.com'
        `);

        if (specificAdmin) {
          pass('admin@syncedupsolutions.com is configured as admin');
        } else {
          warn('admin@syncedupsolutions.com not found in admin_users');
        }
      } else {
        fail('admin_users table', 'No admins configured');
      }
    } catch (error) {
      fail('admin_users table check', error.message);
    }

    console.log('\n2. CONVOSO WEBHOOK PROCESSING\n');
    console.log('----------------------------------------');

    // Check webhook environment variables
    const webhookSecret = process.env.CONVOSO_WEBHOOK_SECRET;
    const authToken = process.env.CONVOSO_AUTH_TOKEN;

    if (webhookSecret) {
      pass('CONVOSO_WEBHOOK_SECRET is configured');
    } else {
      warn('CONVOSO_WEBHOOK_SECRET not configured (webhooks will accept any request)');
    }

    if (authToken) {
      pass('CONVOSO_AUTH_TOKEN is configured');
    } else {
      fail('CONVOSO_AUTH_TOKEN', 'Not configured - required for API calls');
    }

    // Check webhook logs
    try {
      const recentWebhooks = await db.one(`
        SELECT COUNT(*) as count
        FROM call_events
        WHERE type IN ('webhook_received', 'lead_webhook_received')
        AND created_at > NOW() - INTERVAL '24 hours'
      `);

      if (recentWebhooks.count > 0) {
        pass(`${recentWebhooks.count} webhook events logged in last 24 hours`);
      } else {
        warn('No recent webhook events found');
      }
    } catch (error) {
      fail('Webhook event logging check', error.message);
    }

    console.log('\n3. RECORDING FETCH FUNCTIONALITY\n');
    console.log('----------------------------------------');

    // Check for recordings in database
    try {
      const recordingsCount = await db.one(`
        SELECT COUNT(*) as count
        FROM calls
        WHERE recording_url IS NOT NULL
        AND source = 'convoso'
      `);

      if (recordingsCount.count > 0) {
        pass(`${recordingsCount.count} Convoso recordings stored in database`);
      } else {
        warn('No Convoso recordings found in database');
      }
    } catch (error) {
      fail('Recording storage check', error.message);
    }

    // Check pending_recordings table
    try {
      const pendingCheck = await db.oneOrNone(`
        SELECT COUNT(*) as count
        FROM pending_recordings
        WHERE processed = false
      `);

      if (pendingCheck) {
        pass(`pending_recordings table exists (${pendingCheck.count} pending)`);
      }
    } catch (error) {
      // Table might not exist yet
      warn('pending_recordings table not found (migration may be needed)');
    }

    console.log('\n4. DATABASE SCHEMA VERIFICATION\n');
    console.log('----------------------------------------');

    // Check calls table columns
    try {
      const callColumns = await db.manyOrNone(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'calls'
        AND column_name IN ('convoso_lead_id', 'lead_id', 'agent_email', 'agent_name')
      `);

      const foundColumns = callColumns.map(c => c.column_name);

      ['agent_name', 'agent_email', 'lead_id'].forEach(col => {
        if (foundColumns.includes(col)) {
          pass(`calls table has ${col} column`);
        } else {
          warn(`calls table missing ${col} column`);
        }
      });
    } catch (error) {
      fail('calls table schema check', error.message);
    }

    // Check call_events table
    try {
      const eventCount = await db.one(`
        SELECT COUNT(*) as count
        FROM call_events
      `);

      pass(`call_events table exists with ${eventCount.count} events`);
    } catch (error) {
      fail('call_events table check', error.message);
    }

    // Check agents table
    try {
      const agentCount = await db.one(`
        SELECT COUNT(*) as count
        FROM agents
        WHERE team = 'convoso'
      `);

      if (agentCount.count > 0) {
        pass(`${agentCount.count} Convoso agents in database`);
      } else {
        warn('No Convoso agents found in database');
      }
    } catch (error) {
      fail('agents table check', error.message);
    }

    console.log('\n5. CONVOSO API ENDPOINTS\n');
    console.log('----------------------------------------');

    // Test if we can reach Convoso API
    if (authToken) {
      try {
        const testUrl = 'https://api.convoso.com/v1/leads/get-recordings?auth_token=' + authToken + '&lead_id=test&limit=1';
        const response = await fetch(testUrl);

        if (response.status === 401) {
          fail('Convoso API authentication', 'Invalid auth token');
        } else if (response.status === 404) {
          warn('Convoso API endpoint may have changed');
        } else if (response.ok) {
          pass('Convoso API is reachable with auth token');
        } else {
          warn(`Convoso API returned status ${response.status}`);
        }
      } catch (error) {
        fail('Convoso API connectivity', error.message);
      }
    }

    console.log('\n6. API ENDPOINT VERIFICATION\n');
    console.log('----------------------------------------');

    // List critical API endpoints
    const endpoints = [
      '/api/auth/admin',
      '/api/webhooks/convoso',
      '/api/test/fetch-convoso-recordings',
      '/api/test/convoso-diagnose',
      '/api/admin/health',
      '/api/admin/calls',
      '/api/admin/webhook-logs'
    ];

    console.log('Critical endpoints configured:');
    endpoints.forEach(endpoint => {
      console.log(`  - ${endpoint}`);
    });

    console.log('\n========================================');
    console.log('AUDIT SUMMARY');
    console.log('========================================\n');

    console.log(`✅ Passed: ${results.passed.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⚠️ Warnings: ${results.warnings.length}`);

    if (results.failed.length > 0) {
      console.log('\nFailed Tests:');
      results.failed.forEach(f => {
        console.log(`  - ${f.test}: ${f.error}`);
      });
    }

    if (results.warnings.length > 0) {
      console.log('\nWarnings:');
      results.warnings.forEach(w => {
        console.log(`  - ${w}`);
      });
    }

    // Overall health score
    const totalTests = results.passed.length + results.failed.length;
    const score = Math.round((results.passed.length / totalTests) * 100);

    console.log(`\n📊 Overall Health Score: ${score}%`);

    if (score === 100) {
      console.log('🎉 All systems operational!');
    } else if (score >= 80) {
      console.log('✅ System is mostly functional with minor issues');
    } else if (score >= 60) {
      console.log('⚠️ System has several issues that need attention');
    } else {
      console.log('❌ Critical issues detected - immediate action required');
    }

    // Recommendations
    console.log('\n📋 RECOMMENDATIONS:');
    console.log('----------------------------------------');

    if (!authToken) {
      console.log('1. Set CONVOSO_AUTH_TOKEN in .env.local');
    }

    if (!webhookSecret) {
      console.log('2. Consider setting CONVOSO_WEBHOOK_SECRET for webhook security');
    }

    if (results.warnings.find(w => w.includes('pending_recordings'))) {
      console.log('3. Run pending_recordings migration if needed');
    }

    if (results.warnings.find(w => w.includes('No recent webhook'))) {
      console.log('4. Test webhook endpoint with: curl -X POST http://localhost:3000/api/webhooks/convoso');
    }

    if (results.warnings.find(w => w.includes('No Convoso recordings'))) {
      console.log('5. Use /test-recordings page to fetch and store recordings');
    }

    console.log('\n✅ Audit complete!');

  } catch (error) {
    console.error('\n❌ Fatal error during audit:', error);
  } finally {
    process.exit(0);
  }
}

// Run the audit
runAudit();