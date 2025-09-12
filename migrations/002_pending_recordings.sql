-- Migration: Add pending_recordings table and agent columns to calls table
-- Created: 2025-01-12
-- Purpose: Queue Convoso recordings for delayed fetching with agent tracking

-- Create pending_recordings table for queuing recording fetches
CREATE TABLE IF NOT EXISTS pending_recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    lead_id VARCHAR(255),
    convoso_call_id VARCHAR(255),
    agent_id VARCHAR(255),
    agent_name VARCHAR(255),
    campaign VARCHAR(255),
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_call_id UNIQUE (call_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pending_recordings_scheduled_for 
    ON pending_recordings(scheduled_for) 
    WHERE processed = FALSE;

CREATE INDEX IF NOT EXISTS idx_pending_recordings_lead_id 
    ON pending_recordings(lead_id);

CREATE INDEX IF NOT EXISTS idx_pending_recordings_convoso_call_id 
    ON pending_recordings(convoso_call_id);

CREATE INDEX IF NOT EXISTS idx_pending_recordings_processed 
    ON pending_recordings(processed, scheduled_for);

-- Add agent columns to calls table if they don't exist
DO $$ 
BEGIN
    -- Add agent_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calls' AND column_name = 'agent_id'
    ) THEN
        ALTER TABLE calls ADD COLUMN agent_id VARCHAR(255);
    END IF;

    -- Add agent_name column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calls' AND column_name = 'agent_name'
    ) THEN
        ALTER TABLE calls ADD COLUMN agent_name VARCHAR(255);
    END IF;

    -- Add agent_email column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calls' AND column_name = 'agent_email'
    ) THEN
        ALTER TABLE calls ADD COLUMN agent_email VARCHAR(255);
    END IF;

    -- Add convoso_lead_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calls' AND column_name = 'convoso_lead_id'
    ) THEN
        ALTER TABLE calls ADD COLUMN convoso_lead_id VARCHAR(255);
    END IF;

    -- Add convoso_call_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'calls' AND column_name = 'convoso_call_id'
    ) THEN
        ALTER TABLE calls ADD COLUMN convoso_call_id VARCHAR(255);
    END IF;
END $$;

-- Create indexes on new columns
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent_name ON calls(agent_name);
CREATE INDEX IF NOT EXISTS idx_calls_convoso_lead_id ON calls(convoso_lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_convoso_call_id ON calls(convoso_call_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_pending_recordings_updated_at ON pending_recordings;
CREATE TRIGGER update_pending_recordings_updated_at 
    BEFORE UPDATE ON pending_recordings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();