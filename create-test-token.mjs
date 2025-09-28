import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generateWebhookToken() {
  const randomBytes = crypto.randomBytes(16);
  const hexString = randomBytes.toString('hex');
  return `agt_${hexString}`;
}

async function createTestToken() {
  console.log('📋 STEP 1: Run this SQL in Supabase Dashboard SQL Editor:');
  console.log('─────────────────────────────────────────');
  console.log(`
-- First check if table exists
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name = 'webhook_tokens';

-- If returns 0, you need to run the migration file:
-- supabase/migrations/20250927_webhook_tokens.sql
`);

  console.log('\n🔍 Finding first agency...');

  const { data: agencies, error: agencyError } = await supabase
    .from('agencies')
    .select('id, name')
    .limit(1)
    .single();

  if (agencyError || !agencies) {
    console.error('❌ No agencies found:', agencyError);
    return;
  }

  console.log(`✅ Found agency: ${agencies.name} (${agencies.id})`);

  const token = generateWebhookToken();

  console.log('\n📋 STEP 2: After running migration, run this SQL:');
  console.log('─────────────────────────────────────────');
  console.log(`
INSERT INTO webhook_tokens (agency_id, token, name, description, is_active)
VALUES (
  '${agencies.id}',
  '${token}',
  'Test Token',
  'Auto-generated for webhook testing',
  true
)
RETURNING *;
`);

  console.log('\n📋 STEP 3: Then run this in bash:');
  console.log('─────────────────────────────────────────');
  console.log(`export TEST_WEBHOOK_TOKEN="${token}"`);
  console.log('bash test-webhook-security.sh');
  console.log('─────────────────────────────────────────');
}

createTestToken();