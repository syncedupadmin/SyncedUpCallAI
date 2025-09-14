import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from './src/server/db.ts';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function verifySystem() {
  console.log(`${COLORS.bright}${COLORS.blue}═══════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.cyan}  SyncedUp Call AI - System Verification Report${COLORS.reset}`);
  console.log(`${COLORS.bright}${COLORS.blue}═══════════════════════════════════════════════════════${COLORS.reset}\n`);

  const report = {
    database: { status: 'unknown', checks: [] },
    apis: { status: 'unknown', checks: [] },
    endpoints: { status: 'unknown', checks: [] },
    summary: { total: 0, passed: 0, failed: 0, warnings: 0 }
  };

  // 1. Database Health Check
  console.log(`${COLORS.bright}1. DATABASE HEALTH${COLORS.reset}`);
  console.log('─────────────────────────────');

  try {
    // Check connection
    await db.one('SELECT 1 as connected');
    console.log(`${COLORS.green}✓${COLORS.reset} Database connection established`);
    report.database.checks.push({ name: 'Connection', status: 'pass' });

    // Check tables exist
    const tables = await db.any(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN ('calls', 'transcripts', 'analyses', 'transcript_embeddings', 'embeddings_meta')
      ORDER BY tablename
    `);

    const expectedTables = ['analyses', 'calls', 'embeddings_meta', 'transcript_embeddings', 'transcripts'];
    const foundTables = tables.map(t => t.tablename);
    const missingTables = expectedTables.filter(t => !foundTables.includes(t));

    if (missingTables.length === 0) {
      console.log(`${COLORS.green}✓${COLORS.reset} All required tables exist (${expectedTables.length} tables)`);
      report.database.checks.push({ name: 'Tables', status: 'pass' });
    } else {
      console.log(`${COLORS.red}✗${COLORS.reset} Missing tables: ${missingTables.join(', ')}`);
      report.database.checks.push({ name: 'Tables', status: 'fail', missing: missingTables });
    }

    // Check row counts
    const counts = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM calls) as calls,
        (SELECT COUNT(*) FROM transcripts) as transcripts,
        (SELECT COUNT(*) FROM transcript_embeddings) as embeddings,
        (SELECT COUNT(*) FROM embeddings_meta) as embeddings_meta,
        (SELECT COUNT(*) FROM analyses) as analyses
    `);

    console.log(`\n${COLORS.bright}Row Counts:${COLORS.reset}`);
    console.log(`  • Calls: ${counts.calls}`);
    console.log(`  • Transcripts: ${counts.transcripts}`);
    console.log(`  • Embeddings: ${counts.embeddings}`);
    console.log(`  • Embeddings Meta: ${counts.embeddings_meta}`);
    console.log(`  • Analyses: ${counts.analyses}`);

    // Check for unprocessed items
    const unprocessed = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM transcripts t
         WHERE NOT EXISTS (SELECT 1 FROM analyses a WHERE a.call_id = t.call_id)) as unanalyzed,
        (SELECT COUNT(*) FROM transcripts t
         WHERE NOT EXISTS (SELECT 1 FROM transcript_embeddings e WHERE e.call_id = t.call_id)) as unembedded
    `);

    if (unprocessed.unanalyzed > 0 || unprocessed.unembedded > 0) {
      console.log(`\n${COLORS.yellow}⚠${COLORS.reset} Unprocessed items:`);
      if (unprocessed.unanalyzed > 0) {
        console.log(`  • ${unprocessed.unanalyzed} transcripts without analysis`);
        report.database.checks.push({ name: 'Unanalyzed', status: 'warning', count: unprocessed.unanalyzed });
      }
      if (unprocessed.unembedded > 0) {
        console.log(`  • ${unprocessed.unembedded} transcripts without embeddings`);
        report.database.checks.push({ name: 'Unembedded', status: 'warning', count: unprocessed.unembedded });
      }
    }

    report.database.status = 'operational';
  } catch (error) {
    console.log(`${COLORS.red}✗${COLORS.reset} Database error: ${error.message}`);
    report.database.status = 'error';
    report.database.checks.push({ name: 'Connection', status: 'fail', error: error.message });
  }

  // 2. API Keys Check
  console.log(`\n${COLORS.bright}2. API KEYS STATUS${COLORS.reset}`);
  console.log('─────────────────────────────');

  const apiKeys = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CONVOSO_AUTH_TOKEN: process.env.CONVOSO_AUTH_TOKEN
  };

  for (const [key, value] of Object.entries(apiKeys)) {
    if (value) {
      const masked = value.substring(0, 8) + '...' + value.substring(value.length - 4);
      console.log(`${COLORS.green}✓${COLORS.reset} ${key}: ${masked}`);
      report.apis.checks.push({ name: key, status: 'pass' });
    } else {
      console.log(`${COLORS.yellow}⚠${COLORS.reset} ${key}: Not configured`);
      report.apis.checks.push({ name: key, status: 'warning' });
    }
  }

  // 3. Test Critical Endpoints
  console.log(`\n${COLORS.bright}3. ENDPOINT TESTS${COLORS.reset}`);
  console.log('─────────────────────────────');

  const endpoints = [
    { name: 'Admin Health', url: 'http://localhost:3003/api/admin/health', method: 'GET' },
    { name: 'Embed Job', url: 'http://localhost:3003/api/jobs/embed', method: 'POST',
      headers: { 'x-jobs-secret': process.env.JOBS_SECRET },
      body: { call_id: 'test-00000000-0000-0000-0000-000000000000' }
    },
    { name: 'Analyze Job', url: 'http://localhost:3003/api/jobs/analyze', method: 'POST',
      headers: { 'authorization': `Bearer ${process.env.JOBS_SECRET}` },
      body: { callId: 'test-00000000-0000-0000-0000-000000000000' }
    }
  ];

  for (const endpoint of endpoints) {
    try {
      const options = {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          ...endpoint.headers
        }
      };

      if (endpoint.body) {
        options.body = JSON.stringify(endpoint.body);
      }

      const response = await fetch(endpoint.url, options);
      const data = await response.json();

      if (response.ok || (response.status === 404 && data.error === 'no_transcript')) {
        console.log(`${COLORS.green}✓${COLORS.reset} ${endpoint.name}: ${response.status} ${data.ok ? 'OK' : data.error || 'Response received'}`);
        report.endpoints.checks.push({ name: endpoint.name, status: 'pass', code: response.status });
      } else if (response.status === 429) {
        console.log(`${COLORS.yellow}⚠${COLORS.reset} ${endpoint.name}: API quota exceeded (needs credits)`);
        report.endpoints.checks.push({ name: endpoint.name, status: 'warning', code: 429 });
      } else {
        console.log(`${COLORS.red}✗${COLORS.reset} ${endpoint.name}: ${response.status} ${data.error || 'Failed'}`);
        report.endpoints.checks.push({ name: endpoint.name, status: 'fail', code: response.status });
      }
    } catch (error) {
      console.log(`${COLORS.red}✗${COLORS.reset} ${endpoint.name}: ${error.message}`);
      report.endpoints.checks.push({ name: endpoint.name, status: 'fail', error: error.message });
    }
  }

  // 4. OpenAI API Status
  console.log(`\n${COLORS.bright}4. OPENAI API STATUS${COLORS.reset}`);
  console.log('─────────────────────────────');

  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
      });

      if (response.ok) {
        console.log(`${COLORS.green}✓${COLORS.reset} OpenAI API: Connected successfully`);
        report.apis.checks.push({ name: 'OpenAI API', status: 'pass' });
      } else if (response.status === 429) {
        const errorText = await response.text();
        console.log(`${COLORS.red}✗${COLORS.reset} OpenAI API: Quota exceeded`);
        console.log(`  ${errorText.substring(0, 200)}`);
        report.apis.checks.push({ name: 'OpenAI API', status: 'fail', error: 'quota_exceeded' });
      } else {
        console.log(`${COLORS.red}✗${COLORS.reset} OpenAI API: Status ${response.status}`);
        report.apis.checks.push({ name: 'OpenAI API', status: 'fail', code: response.status });
      }
    } catch (error) {
      console.log(`${COLORS.red}✗${COLORS.reset} OpenAI API: ${error.message}`);
      report.apis.checks.push({ name: 'OpenAI API', status: 'fail', error: error.message });
    }
  }

  // Summary
  console.log(`\n${COLORS.bright}${COLORS.blue}═══════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bright}SUMMARY${COLORS.reset}`);
  console.log('─────────────────────────────');

  // Count results
  const allChecks = [
    ...report.database.checks,
    ...report.apis.checks,
    ...report.endpoints.checks
  ];

  report.summary.total = allChecks.length;
  report.summary.passed = allChecks.filter(c => c.status === 'pass').length;
  report.summary.failed = allChecks.filter(c => c.status === 'fail').length;
  report.summary.warnings = allChecks.filter(c => c.status === 'warning').length;

  console.log(`Total Checks: ${report.summary.total}`);
  console.log(`${COLORS.green}Passed: ${report.summary.passed}${COLORS.reset}`);
  console.log(`${COLORS.red}Failed: ${report.summary.failed}${COLORS.reset}`);
  console.log(`${COLORS.yellow}Warnings: ${report.summary.warnings}${COLORS.reset}`);

  // Critical Issues
  if (report.summary.failed > 0) {
    console.log(`\n${COLORS.bright}${COLORS.red}CRITICAL ISSUES:${COLORS.reset}`);
    const openAIFail = allChecks.find(c => c.name === 'OpenAI API' && c.error === 'quota_exceeded');
    if (openAIFail) {
      console.log(`${COLORS.red}• OpenAI API quota exceeded - system cannot process new calls${COLORS.reset}`);
      console.log(`  Solution: Add OpenAI credits or configure ANTHROPIC_API_KEY as fallback`);
    }
  }

  // Recommendations
  if (report.summary.warnings > 0) {
    console.log(`\n${COLORS.bright}${COLORS.yellow}RECOMMENDATIONS:${COLORS.reset}`);
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log(`${COLORS.yellow}• Configure ANTHROPIC_API_KEY for fallback when OpenAI quota is exceeded${COLORS.reset}`);
    }
    const unanalyzed = report.database.checks.find(c => c.name === 'Unanalyzed');
    if (unanalyzed && unanalyzed.count > 0) {
      console.log(`${COLORS.yellow}• Process ${unanalyzed.count} unanalyzed transcripts${COLORS.reset}`);
    }
    const unembedded = report.database.checks.find(c => c.name === 'Unembedded');
    if (unembedded && unembedded.count > 0) {
      console.log(`${COLORS.yellow}• Generate embeddings for ${unembedded.count} transcripts${COLORS.reset}`);
    }
  }

  console.log(`\n${COLORS.bright}${COLORS.blue}═══════════════════════════════════════════════════════${COLORS.reset}\n`);

  process.exit(report.summary.failed > 0 ? 1 : 0);
}

verifySystem().catch(error => {
  console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, error);
  process.exit(1);
});