#!/usr/bin/env node

/**
 * Backfill Script for SyncedUp Call AI
 * 
 * Usage:
 *   node scripts/backfill.js transcripts [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--limit N] [--force]
 *   node scripts/backfill.js analyses [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--limit N]
 *   node scripts/backfill.js embeddings [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--limit N]
 *   node scripts/backfill.js rollups [--start YYYY-MM-DD] [--end YYYY-MM-DD]
 *   node scripts/backfill.js status
 */

const https = require('https');
const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(`
Backfill Script for SyncedUp Call AI

Usage:
  node scripts/backfill.js <type> [options]

Types:
  transcripts  - Backfill missing transcripts
  analyses     - Backfill missing analyses
  embeddings   - Backfill missing embeddings
  rollups      - Generate revenue rollups
  status       - Check backfill status and gaps

Options:
  --start YYYY-MM-DD  - Start date for backfill
  --end YYYY-MM-DD    - End date for backfill  
  --limit N           - Maximum items to process (default: 100)
  --force             - Force reprocessing even if exists
  --url URL           - API URL (default: http://localhost:3000)

Examples:
  node scripts/backfill.js transcripts --limit 50
  node scripts/backfill.js analyses --start 2024-01-01 --end 2024-01-31
  node scripts/backfill.js rollups --start 2024-01-01
  node scripts/backfill.js status
`);
  process.exit(0);
}

// Parse options
const options = {
  type: command,
  startDate: null,
  endDate: null,
  limit: 100,
  force: false,
  url: process.env.API_URL || 'http://localhost:3000'
};

for (let i = 1; i < args.length; i++) {
  switch (args[i]) {
    case '--start':
      options.startDate = args[++i];
      break;
    case '--end':
      options.endDate = args[++i];
      break;
    case '--limit':
      options.limit = parseInt(args[++i]);
      break;
    case '--force':
      options.force = true;
      break;
    case '--url':
      options.url = args[++i];
      break;
  }
}

// Validate dates
if (options.startDate && !isValidDate(options.startDate)) {
  console.error(`Invalid start date: ${options.startDate}`);
  process.exit(1);
}

if (options.endDate && !isValidDate(options.endDate)) {
  console.error(`Invalid end date: ${options.endDate}`);
  process.exit(1);
}

function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

// Make API request
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, options.url);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = lib.request(requestOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${json.error || body}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Progress bar
function showProgress(current, total, startTime) {
  const percent = Math.round((current / total) * 100);
  const elapsed = Date.now() - startTime;
  const rate = current / (elapsed / 1000);
  const eta = Math.round((total - current) / rate);
  
  const barLength = 40;
  const filled = Math.round(barLength * (current / total));
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
  
  process.stdout.write(`\r[${bar}] ${percent}% | ${current}/${total} | ${rate.toFixed(1)}/s | ETA: ${eta}s  `);
}

// Main execution
async function main() {
  console.log(`\n🔄 Starting ${command} backfill...`);
  console.log(`   URL: ${options.url}`);
  
  if (options.startDate) console.log(`   Start: ${options.startDate}`);
  if (options.endDate) console.log(`   End: ${options.endDate}`);
  if (options.limit && command !== 'status') console.log(`   Limit: ${options.limit}`);
  if (options.force) console.log(`   Force: true`);
  console.log('');

  try {
    if (command === 'status') {
      // Get backfill status
      const status = await makeRequest('GET', '/api/admin/backfill');
      
      console.log('📊 Backfill Status\n');
      console.log('Current Gaps:');
      console.log(`  • Missing transcripts: ${status.gaps.missing_transcripts}`);
      console.log(`  • Missing analyses: ${status.gaps.missing_analyses}`);
      console.log(`  • Missing embeddings: ${status.gaps.missing_embeddings}`);
      console.log(`  • Missing rollups: ${status.gaps.missing_rollups}`);
      
      if (status.recent_backfills && status.recent_backfills.length > 0) {
        console.log('\nRecent Backfills:');
        status.recent_backfills.forEach(event => {
          const payload = event.payload;
          const date = new Date(event.created_at).toLocaleString();
          console.log(`  • ${date}: ${payload.type} - ${payload.processed} processed, ${payload.errors} errors (${payload.duration_ms}ms)`);
        });
      }
    } else {
      // Run backfill
      const startTime = Date.now();
      
      const body = {
        type: command,
        startDate: options.startDate,
        endDate: options.endDate,
        limit: options.limit,
        force: options.force
      };
      
      // Remove null values
      Object.keys(body).forEach(key => {
        if (body[key] === null) delete body[key];
      });
      
      console.log('⏳ Processing...\n');
      
      const result = await makeRequest('POST', '/api/admin/backfill', body);
      
      console.log('\n✅ Backfill completed!\n');
      console.log(`   Processed: ${result.processed}`);
      console.log(`   Skipped: ${result.skipped}`);
      console.log(`   Errors: ${result.errors}`);
      console.log(`   Duration: ${(result.duration_ms / 1000).toFixed(1)}s`);
      
      if (result.errors > 0) {
        console.log('\n⚠️  Some items failed to process. Check logs for details.');
      }
    }
    
    console.log('\n✨ Done!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});