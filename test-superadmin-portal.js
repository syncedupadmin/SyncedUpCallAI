#!/usr/bin/env node

/**
 * Comprehensive Super Admin Portal Test Script
 * Tests all critical functionality of the super admin portal
 */

// Use native fetch (Node 18+)
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';

class SuperAdminPortalTester {
  constructor() {
    this.results = {
      passed: [],
      failed: [],
      warnings: []
    };
    this.startTime = Date.now();
  }

  log(message, type = 'info') {
    const prefix = {
      'success': `${colors.green}✓${colors.reset}`,
      'error': `${colors.red}✗${colors.reset}`,
      'warning': `${colors.yellow}⚠${colors.reset}`,
      'info': `${colors.cyan}ℹ${colors.reset}`,
      'test': `${colors.bright}▶${colors.reset}`
    }[type] || '';

    console.log(`${prefix} ${message}`);
  }

  async testEndpoint(name, url, options = {}) {
    this.log(`Testing: ${name}`, 'test');

    try {
      const response = await fetch(`${BASE_URL}${url}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      const data = response.headers.get('content-type')?.includes('json')
        ? await response.json()
        : await response.text();

      if (response.ok) {
        this.log(`  Response: ${response.status} ${response.statusText}`, 'success');
        this.results.passed.push({ name, url, status: response.status });
        return { success: true, data, response };
      } else {
        this.log(`  Response: ${response.status} ${response.statusText}`, 'error');
        this.log(`  Error: ${JSON.stringify(data)}`, 'error');
        this.results.failed.push({ name, url, status: response.status, error: data });
        return { success: false, data, response };
      }
    } catch (error) {
      this.log(`  Network Error: ${error.message}`, 'error');
      this.results.failed.push({ name, url, error: error.message });
      return { success: false, error };
    }
  }

  async testHealthEndpoints() {
    console.log(`\n${colors.bright}=== HEALTH & STATUS ENDPOINTS ===${colors.reset}`);

    await this.testEndpoint('Health Check', '/api/health');
    await this.testEndpoint('System Status', '/api/status');
    await this.testEndpoint('System Metrics', '/api/metrics/system');
    await this.testEndpoint('Job Metrics', '/api/metrics/jobs');
    await this.testEndpoint('Error Metrics', '/api/metrics/errors');
  }

  async testAuthenticationFlow() {
    console.log(`\n${colors.bright}=== AUTHENTICATION FLOW ===${colors.reset}`);

    // Test admin auth endpoint
    const authResult = await this.testEndpoint('Admin Auth Check', '/api/auth/admin', {
      method: 'GET'
    });

    if (!authResult.success) {
      this.log('  Note: Authentication required for protected endpoints', 'warning');
      this.results.warnings.push('Authentication not configured - some tests may fail');
    }

    return authResult;
  }

  async testAPIEndpoints() {
    console.log(`\n${colors.bright}=== API ENDPOINTS ===${colors.reset}`);

    // Test various API endpoints that should be accessible
    await this.testEndpoint('Calls API', '/api/calls?limit=1');
    await this.testEndpoint('Agencies API', '/api/agencies');
    await this.testEndpoint('Users API', '/api/users');
  }

  async testDatabaseConnectivity() {
    console.log(`\n${colors.bright}=== DATABASE CONNECTIVITY ===${colors.reset}`);

    const healthResult = await this.testEndpoint('Database Health', '/api/health');

    if (healthResult.success && healthResult.data) {
      const dbStatus = healthResult.data.services?.database?.status;
      if (dbStatus === 'healthy') {
        this.log('  Database connection: HEALTHY', 'success');

        // Check pool stats
        const pool = healthResult.data.resources?.pool;
        if (pool) {
          this.log(`  Connection pool: ${pool.active}/${pool.total} active (${pool.utilization}% utilization)`, 'info');
        }
      } else {
        this.log(`  Database connection: ${dbStatus || 'UNKNOWN'}`, 'error');
      }
    }
  }

  async testExternalServices() {
    console.log(`\n${colors.bright}=== EXTERNAL SERVICES ===${colors.reset}`);

    const statusResult = await this.testEndpoint('Service Status', '/api/status');

    if (statusResult.success && statusResult.data) {
      const services = statusResult.data.services?.external_apis;
      if (services) {
        for (const [service, status] of Object.entries(services)) {
          const color = status === 'operational' ? 'success' :
                        status === 'degraded' ? 'warning' : 'error';
          this.log(`  ${service}: ${status.toUpperCase()}`, color);
        }
      }
    }
  }

  async testQueueStatus() {
    console.log(`\n${colors.bright}=== QUEUE STATUS ===${colors.reset}`);

    const statusResult = await this.testEndpoint('Queue Status', '/api/status');

    if (statusResult.success && statusResult.data) {
      const queues = statusResult.data.services?.queues;
      if (queues) {
        this.log('  Recording Queue:', 'info');
        this.log(`    Pending: ${queues.recordings.pending}`, 'info');
        this.log(`    Processing: ${queues.recordings.processing}`, 'info');
        this.log(`    Failed: ${queues.recordings.failed}`, queues.recordings.failed > 10 ? 'warning' : 'info');
        this.log(`    Stale: ${queues.recordings.stale}`, queues.recordings.stale > 0 ? 'warning' : 'info');

        this.log('  Transcription Queue:', 'info');
        this.log(`    Pending: ${queues.transcriptions.pending}`, 'info');
        this.log(`    Processing: ${queues.transcriptions.processing}`, 'info');
        this.log(`    Completed Today: ${queues.transcriptions.completed_today}`, 'info');
      }
    }
  }

  async testNavigationStructure() {
    console.log(`\n${colors.bright}=== NAVIGATION & UI STRUCTURE ===${colors.reset}`);

    // Test if main super admin page loads
    const pageResult = await this.testEndpoint('Super Admin Page', '/superadmin');

    if (pageResult.response && pageResult.response.status === 200) {
      this.log('  Super admin page loads successfully', 'success');
    } else if (pageResult.response && pageResult.response.status === 401) {
      this.log('  Super admin page requires authentication (expected)', 'warning');
    }

    // Test other pages
    const pages = [
      '/superadmin/operations',
      '/superadmin/agencies',
      '/superadmin/calls',
      '/superadmin/analytics'
    ];

    for (const page of pages) {
      await this.testEndpoint(`Page: ${page}`, page);
    }
  }

  async testErrorHandling() {
    console.log(`\n${colors.bright}=== ERROR HANDLING ===${colors.reset}`);

    // Test error tracking
    const errorResult = await this.testEndpoint('Error Metrics', '/api/metrics/errors');

    if (errorResult.success && errorResult.data) {
      const totalErrors = errorResult.data.total_errors || 0;
      const criticalErrors = errorResult.data.errors_by_severity?.critical || 0;

      this.log(`  Total errors (last hour): ${totalErrors}`, totalErrors > 100 ? 'warning' : 'info');
      this.log(`  Critical errors: ${criticalErrors}`, criticalErrors > 0 ? 'error' : 'success');
    }
  }

  generateReport() {
    console.log(`\n${colors.bright}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bright}SUPER ADMIN PORTAL TEST REPORT${colors.reset}`);
    console.log(`${colors.bright}${'='.repeat(60)}${colors.reset}\n`);

    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const total = this.results.passed.length + this.results.failed.length;
    const passRate = total > 0 ? ((this.results.passed.length / total) * 100).toFixed(1) : 0;

    console.log(`${colors.cyan}Test Duration:${colors.reset} ${duration}s`);
    console.log(`${colors.cyan}Total Tests:${colors.reset} ${total}`);
    console.log(`${colors.green}Passed:${colors.reset} ${this.results.passed.length}`);
    console.log(`${colors.red}Failed:${colors.reset} ${this.results.failed.length}`);
    console.log(`${colors.yellow}Warnings:${colors.reset} ${this.results.warnings.length}`);
    console.log(`${colors.cyan}Pass Rate:${colors.reset} ${passRate}%`);

    if (this.results.passed.length > 0) {
      console.log(`\n${colors.green}✅ WORKING FEATURES:${colors.reset}`);
      this.results.passed.forEach(test => {
        console.log(`  ✓ ${test.name} (${test.url})`);
      });
    }

    if (this.results.failed.length > 0) {
      console.log(`\n${colors.red}❌ FAILED TESTS:${colors.reset}`);
      this.results.failed.forEach(test => {
        console.log(`  ✗ ${test.name} (${test.url})`);
        if (test.error) {
          console.log(`    Error: ${colors.gray}${typeof test.error === 'string' ? test.error : JSON.stringify(test.error)}${colors.reset}`);
        }
      });
    }

    if (this.results.warnings.length > 0) {
      console.log(`\n${colors.yellow}⚠️ WARNINGS:${colors.reset}`);
      this.results.warnings.forEach(warning => {
        console.log(`  • ${warning}`);
      });
    }

    // Overall status
    console.log(`\n${colors.bright}📊 OVERALL STATUS:${colors.reset}`);
    if (this.results.failed.length === 0) {
      console.log(`${colors.green}  ✅ All tests passed - Super Admin Portal is fully operational${colors.reset}`);
    } else if (this.results.failed.length <= 2) {
      console.log(`${colors.yellow}  ⚠️ Minor issues detected - Portal is mostly operational${colors.reset}`);
    } else {
      console.log(`${colors.red}  ❌ Multiple issues detected - Portal functionality is compromised${colors.reset}`);
    }

    console.log(`\n${colors.bright}${'='.repeat(60)}${colors.reset}`);
  }

  async run() {
    console.log(`${colors.bright}Starting Super Admin Portal Verification...${colors.reset}`);
    console.log(`Testing against: ${BASE_URL}\n`);

    // Run all tests
    await this.testHealthEndpoints();
    await this.testAuthenticationFlow();
    await this.testAPIEndpoints();
    await this.testDatabaseConnectivity();
    await this.testExternalServices();
    await this.testQueueStatus();
    await this.testNavigationStructure();
    await this.testErrorHandling();

    // Generate report
    this.generateReport();
  }
}

// Run the tester
const tester = new SuperAdminPortalTester();
tester.run().catch(error => {
  console.error(`${colors.red}Fatal error during testing:${colors.reset}`, error);
  process.exit(1);
});