-- Agency Discovery Flow Migration
-- Adds discovery tracking columns and RLS policies for agency-scoped discovery

-- Add discovery tracking columns to agencies table
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS discovery_status VARCHAR(50) DEFAULT 'pending';
-- Values: 'pending', 'in_progress', 'completed', 'skipped', 'failed'

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS discovery_session_id UUID REFERENCES discovery_sessions(id);

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS convoso_credentials JSONB;
-- Stores encrypted { api_key: {encrypted, iv, authTag}, auth_token: {encrypted, iv, authTag}, api_base }

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS discovery_skip_reason TEXT;
-- Reason for skipping discovery (e.g., 'insufficient_data', 'user_skipped')

-- Add agency_id to discovery_sessions for multi-tenancy
ALTER TABLE discovery_sessions ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agencies_discovery_status
  ON agencies(discovery_status)
  WHERE discovery_status != 'completed';

CREATE INDEX IF NOT EXISTS idx_discovery_sessions_agency
  ON discovery_sessions(agency_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_sessions_status_agency
  ON discovery_sessions(status, agency_id)
  WHERE status IN ('initializing', 'pulling', 'analyzing');

-- Enable RLS on discovery_sessions
ALTER TABLE discovery_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Agencies can view own discovery sessions" ON discovery_sessions;
DROP POLICY IF EXISTS "Agencies can insert own discovery sessions" ON discovery_sessions;
DROP POLICY IF EXISTS "Agencies can update own discovery sessions" ON discovery_sessions;

-- Create RLS policies for agency-scoped access
CREATE POLICY "Agencies can view own discovery sessions"
  ON discovery_sessions FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Agencies can insert own discovery sessions"
  ON discovery_sessions FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Agencies can update own discovery sessions"
  ON discovery_sessions FOR UPDATE
  USING (
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- Create a function to get agency discovery status
CREATE OR REPLACE FUNCTION get_agency_discovery_status(agency_uuid UUID)
RETURNS TABLE (
  status VARCHAR(50),
  session_id UUID,
  progress INT,
  metrics JSONB,
  insights JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.discovery_status,
    a.discovery_session_id,
    ds.progress,
    ds.metrics,
    ds.insights
  FROM agencies a
  LEFT JOIN discovery_sessions ds ON ds.id = a.discovery_session_id
  WHERE a.id = agency_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_agency_discovery_status TO authenticated;

-- Add comment to document the schema
COMMENT ON COLUMN agencies.discovery_status IS 'Discovery flow status: pending (not started), in_progress (running), completed (finished), skipped (user skipped), failed (error occurred)';
COMMENT ON COLUMN agencies.convoso_credentials IS 'Encrypted Convoso API credentials using AES-256-GCM';
COMMENT ON COLUMN discovery_sessions.agency_id IS 'Links discovery session to specific agency for multi-tenancy';