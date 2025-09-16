import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
dotenv.config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function applyMigration() {
  try {
    await client.connect();
    console.log('Connected to database...');

    // Add columns for recording matching
    console.log('Adding recording fingerprint columns...');
    await client.query(`
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_fingerprint VARCHAR(255)
    `);

    await client.query(`
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_matched_at TIMESTAMP WITH TIME ZONE
    `);

    await client.query(`
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_match_confidence VARCHAR(20)
    `);

    console.log('Columns added successfully');

    // Create indexes
    console.log('Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_calls_recording_fingerprint ON calls(recording_fingerprint)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_calls_lead_agent_time ON calls(lead_id, agent_name, started_at)
    `);

    console.log('Indexes created');

    // Create unmatched_recordings table
    console.log('Creating unmatched_recordings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS unmatched_recordings (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        lead_id VARCHAR(255) NOT NULL,
        recording_id VARCHAR(255),
        recording_url TEXT,
        start_time TIMESTAMP WITH TIME ZONE,
        end_time TIMESTAMP WITH TIME ZONE,
        duration_seconds INTEGER,
        potential_matches JSONB DEFAULT '[]'::jsonb,
        reviewed BOOLEAN DEFAULT FALSE,
        reviewed_at TIMESTAMP WITH TIME ZONE,
        assigned_to_call_id UUID REFERENCES calls(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    console.log('Table created');

    // Create indexes for unmatched_recordings
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_unmatched_recordings_lead ON unmatched_recordings(lead_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_unmatched_recordings_reviewed ON unmatched_recordings(reviewed)
    `);

    console.log('✅ Migration completed successfully!');

    // Verify the changes
    const columns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'calls'
        AND column_name IN ('recording_fingerprint', 'recording_matched_at', 'recording_match_confidence')
    `);

    console.log('\nVerified new columns:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
  }
}

applyMigration();