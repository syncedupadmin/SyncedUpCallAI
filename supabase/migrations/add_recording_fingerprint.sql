-- Add columns for precise recording-to-agent matching
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_fingerprint VARCHAR(255);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_matched_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_match_confidence VARCHAR(20);

-- Add constraint for confidence values
ALTER TABLE calls ADD CONSTRAINT recording_confidence_check
  CHECK (recording_match_confidence IN ('exact', 'fuzzy', 'probable', 'manual', 'unmatched') OR recording_match_confidence IS NULL);

-- Create index for fingerprint lookups
CREATE INDEX IF NOT EXISTS idx_calls_recording_fingerprint ON calls(recording_fingerprint);
CREATE INDEX IF NOT EXISTS idx_calls_lead_agent_time ON calls(lead_id, agent_name, started_at);

-- Create table for unmatched recordings that need review
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
);

-- Create index for unmatched recordings
CREATE INDEX IF NOT EXISTS idx_unmatched_recordings_lead ON unmatched_recordings(lead_id);
CREATE INDEX IF NOT EXISTS idx_unmatched_recordings_reviewed ON unmatched_recordings(reviewed);

-- Add comment explaining the strategy
COMMENT ON COLUMN calls.recording_fingerprint IS 'Unique identifier for matching recordings: lead_id_agent_name_timestamp_duration';
COMMENT ON COLUMN calls.recording_match_confidence IS 'Confidence level of recording match: exact (100%), fuzzy (95%), probable (80%), manual (user-assigned), unmatched';
COMMENT ON TABLE unmatched_recordings IS 'Recordings that could not be automatically matched to calls with high confidence';