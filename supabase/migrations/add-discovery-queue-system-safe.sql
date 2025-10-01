-- Discovery Queue System Migration (Safe - won't error if already exists)
-- Enables background processing of discovery calls to avoid Vercel timeout limits

-- 1. Add agency_id to discovery_sessions if missing
ALTER TABLE discovery_sessions
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id);

-- 2. Create discovery_calls table for queue-based processing
CREATE TABLE IF NOT EXISTS discovery_calls (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES discovery_sessions(id) ON DELETE CASCADE,

  -- Convoso call metadata
  call_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  campaign TEXT,
  status TEXT,  -- Convoso disposition
  call_length INTEGER,
  call_type TEXT,
  started_at TIMESTAMPTZ,

  -- Processing tracking
  processing_status VARCHAR(20) DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Results
  recording_url TEXT,
  transcript TEXT,
  analysis JSONB,  -- Full OpenAI analysis result

  -- Error handling
  error_message TEXT,
  attempts INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  -- Prevent duplicates
  UNIQUE(session_id, call_id)
);

-- 3. Indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_discovery_calls_session_pending
  ON discovery_calls(session_id, processing_status, created_at)
  WHERE processing_status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_discovery_calls_session_completed
  ON discovery_calls(session_id)
  WHERE processing_status = 'completed';

CREATE INDEX IF NOT EXISTS idx_discovery_calls_lookup
  ON discovery_calls(session_id, call_id);

-- 4. RLS for discovery_calls (matches discovery_sessions pattern)
ALTER TABLE discovery_calls ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists, then recreate
DROP POLICY IF EXISTS "Users can view own agency discovery calls" ON discovery_calls;

CREATE POLICY "Users can view own agency discovery calls"
  ON discovery_calls FOR SELECT
  USING (
    session_id IN (
      SELECT ds.id FROM discovery_sessions ds
      WHERE ds.agency_id IN (
        SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
      )
    )
  );

-- No INSERT/UPDATE policies needed - only service role (cron) writes to this table

-- 5. Helper function to get pending calls count
CREATE OR REPLACE FUNCTION get_discovery_pending_count(p_session_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM discovery_calls
  WHERE session_id = p_session_id
    AND processing_status = 'pending';
$$ LANGUAGE SQL STABLE;

-- 6. Helper function to get completed calls count
CREATE OR REPLACE FUNCTION get_discovery_completed_count(p_session_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM discovery_calls
  WHERE session_id = p_session_id
    AND processing_status = 'completed';
$$ LANGUAGE SQL STABLE;

-- 7. Grant permissions (will succeed even if already granted)
DO $$
BEGIN
  GRANT USAGE ON SEQUENCE discovery_calls_id_seq TO authenticated;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if already granted
END $$;

GRANT SELECT ON discovery_calls TO authenticated;
GRANT EXECUTE ON FUNCTION get_discovery_pending_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_discovery_completed_count(UUID) TO authenticated;
