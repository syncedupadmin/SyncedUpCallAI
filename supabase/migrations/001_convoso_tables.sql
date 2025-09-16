-- Migration: Create Convoso integration tables
-- Idempotent: Safe to run multiple times

-- 1. Create contacts table (for lead data)
CREATE TABLE IF NOT EXISTS contacts (
  contact_id SERIAL PRIMARY KEY,
  lead_id TEXT UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone_number TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  list_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on lead_id for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_lead_id ON contacts(lead_id);

-- 2. Ensure calls table has correct schema
-- Add missing columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'call_id') THEN
    ALTER TABLE calls ADD COLUMN call_id TEXT UNIQUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'lead_id') THEN
    ALTER TABLE calls ADD COLUMN lead_id TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'agent_name') THEN
    ALTER TABLE calls ADD COLUMN agent_name TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'disposition') THEN
    ALTER TABLE calls ADD COLUMN disposition TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'duration') THEN
    ALTER TABLE calls ADD COLUMN duration INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'campaign') THEN
    ALTER TABLE calls ADD COLUMN campaign TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'recording_url') THEN
    ALTER TABLE calls ADD COLUMN recording_url TEXT;
  END IF;
END $$;

-- Create index on call_id if not exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_call_id ON calls(call_id);

-- 3. Create pending_recordings table
CREATE TABLE IF NOT EXISTS pending_recordings (
  id SERIAL PRIMARY KEY,
  call_id TEXT,
  lead_id TEXT,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for pending_recordings
CREATE INDEX IF NOT EXISTS idx_pending_recordings_call_id ON pending_recordings(call_id);
CREATE INDEX IF NOT EXISTS idx_pending_recordings_lead_id ON pending_recordings(lead_id);
CREATE INDEX IF NOT EXISTS idx_pending_recordings_attempts ON pending_recordings(attempts);