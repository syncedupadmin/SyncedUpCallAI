import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        process.env[key.trim()] = value;
      }
    }
  });
}

const { Pool } = pg;

async function runMigration(sqlFile) {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment');
    console.log('\n💡 Please run migrations manually via Supabase Dashboard:');
    console.log('   1. Go to https://app.supabase.io');
    console.log('   2. Select your project');
    console.log('   3. Go to SQL Editor → New Query');
    console.log(`   4. Copy/paste the SQL from: ${sqlFile}\n`);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const sql = fs.readFileSync(sqlFile, 'utf8');
    console.log(`\n📝 Running migration: ${path.basename(sqlFile)}`);
    console.log('─'.repeat(60));

    await pool.query(sql);

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:');
    console.error(error.message);
    if (error.detail) {
      console.error('Detail:', error.detail);
    }

    console.log('\n💡 Please run this migration manually via Supabase Dashboard:');
    console.log('   1. Go to https://app.supabase.io');
    console.log('   2. Select your project');
    console.log('   3. Go to SQL Editor → New Query');
    console.log(`   4. Copy/paste the SQL from: ${sqlFile}\n`);

    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Get migration file from command line argument
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node run-migration.mjs <path-to-sql-file>');
  process.exit(1);
}

if (!fs.existsSync(migrationFile)) {
  console.error(`Error: File not found: ${migrationFile}`);
  process.exit(1);
}

runMigration(migrationFile);
