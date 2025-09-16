-- Fix Convoso Schema Conflicts
-- This migration resolves conflicts between different table definitions

-- 1. First, check and fix the contacts table
-- We'll use the Convoso version with lead_id as the primary identifier
DO $$
BEGIN
  -- Check if contacts table exists with old schema
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'primary_phone'
  ) THEN
    -- Migrate data from old schema to new schema
    -- Create temporary table with new schema
    CREATE TABLE IF NOT EXISTS contacts_new (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      lead_id TEXT UNIQUE,
      phone_number TEXT,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      list_id TEXT,
      alt_phones TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Copy data from old table
    INSERT INTO contacts_new (id, phone_number, email, alt_phones, created_at, updated_at)
    SELECT id, primary_phone, email, alt_phones, created_at, updated_at
    FROM contacts
    ON CONFLICT DO NOTHING;

    -- Drop old table and rename new one
    DROP TABLE IF EXISTS contacts CASCADE;
    ALTER TABLE contacts_new RENAME TO contacts;
  ELSE
    -- Ensure contacts table has all required columns
    CREATE TABLE IF NOT EXISTS contacts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      lead_id TEXT UNIQUE,
      phone_number TEXT,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      list_id TEXT,
      alt_phones TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END $$;

-- Create indexes for contacts
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_lead_id ON contacts(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts(created_at DESC);

-- 2. Fix the calls table to properly support Convoso data
DO $$
BEGIN
  -- Add Convoso-specific columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'call_id') THEN
    ALTER TABLE calls ADD COLUMN call_id TEXT UNIQUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'lead_id') THEN
    ALTER TABLE calls ADD COLUMN lead_id TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'agent_name') THEN
    ALTER TABLE calls ADD COLUMN agent_name TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'phone_number') THEN
    ALTER TABLE calls ADD COLUMN phone_number TEXT;
  END IF;

  -- Rename duration_sec to duration if needed
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'duration_sec')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'duration') THEN
    ALTER TABLE calls ADD COLUMN duration INTEGER;
    UPDATE calls SET duration = duration_sec WHERE duration_sec IS NOT NULL;
  END IF;

  -- Ensure disposition column exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'disposition') THEN
    ALTER TABLE calls ADD COLUMN disposition TEXT;
  END IF;

  -- Ensure recording_url column exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'recording_url') THEN
    ALTER TABLE calls ADD COLUMN recording_url TEXT;
  END IF;

  -- Ensure campaign column exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'campaign') THEN
    ALTER TABLE calls ADD COLUMN campaign TEXT;
  END IF;

  -- Add created_at if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'created_at') THEN
    ALTER TABLE calls ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Create indexes for calls
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_call_id ON calls(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_agent_name ON calls(agent_name) WHERE agent_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_disposition ON calls(disposition) WHERE disposition IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_phone ON calls(phone_number) WHERE phone_number IS NOT NULL;

-- 3. Ensure pending_recordings table exists
CREATE TABLE IF NOT EXISTS pending_recordings (
  id SERIAL PRIMARY KEY,
  call_id TEXT,
  lead_id TEXT,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Create indexes for pending_recordings
CREATE INDEX IF NOT EXISTS idx_pending_recordings_call_id ON pending_recordings(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_recordings_lead_id ON pending_recordings(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_recordings_attempts ON pending_recordings(attempts);
CREATE INDEX IF NOT EXISTS idx_pending_recordings_processed ON pending_recordings(processed_at) WHERE processed_at IS NULL;

-- 4. Create webhook_logs table for debugging
CREATE TABLE IF NOT EXISTS webhook_logs (
  id SERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  headers JSONB,
  body JSONB,
  response_status INTEGER,
  response_body JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_endpoint ON webhook_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_error ON webhook_logs(error) WHERE error IS NOT NULL;

-- 5. Create a view to join calls with contacts
CREATE OR REPLACE VIEW call_details AS
SELECT
  c.id,
  c.call_id,
  c.lead_id,
  c.agent_name,
  c.phone_number,
  c.disposition,
  c.duration,
  c.campaign,
  c.recording_url,
  c.started_at,
  c.ended_at,
  c.created_at,
  ct.first_name,
  ct.last_name,
  ct.email,
  ct.address,
  ct.city,
  ct.state
FROM calls c
LEFT JOIN contacts ct ON c.lead_id = ct.lead_id;

-- 6. Add RLS policies for new tables
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_logs_admin_only" ON webhook_logs
  FOR ALL
  USING (auth.jwt() ->> 'email' IN (
    SELECT email FROM auth.users WHERE raw_user_meta_data->>'is_admin' = 'true'
  ));

-- Grant permissions
GRANT ALL ON contacts TO authenticated;
GRANT ALL ON calls TO authenticated;
GRANT ALL ON pending_recordings TO authenticated;
GRANT ALL ON webhook_logs TO authenticated;
GRANT SELECT ON call_details TO authenticated;

-- Add helpful comments
COMMENT ON TABLE contacts IS 'Stores lead/contact information from Convoso';
COMMENT ON TABLE calls IS 'Stores call records from Convoso webhooks';
COMMENT ON TABLE pending_recordings IS 'Queue for recordings that need to be fetched';
COMMENT ON TABLE webhook_logs IS 'Debug log for webhook requests';
COMMENT ON VIEW call_details IS 'Combined view of calls with contact information';