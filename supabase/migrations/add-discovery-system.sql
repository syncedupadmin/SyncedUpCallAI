-- Discovery System Tables for Pattern Analysis

-- Discovery sessions table
CREATE TABLE IF NOT EXISTS discovery_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(50) DEFAULT 'initializing', -- initializing, pulling, analyzing, complete, error
  progress INT DEFAULT 0,
  processed INT DEFAULT 0,
  total_calls INT,
  config JSONB, -- Configuration for this discovery run
  metrics JSONB, -- Discovered metrics
  insights JSONB, -- Progressive insights
  patterns JSONB, -- Discovered patterns
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Index for active sessions
CREATE INDEX IF NOT EXISTS idx_discovery_sessions_status
  ON discovery_sessions(status)
  WHERE status IN ('initializing', 'pulling', 'analyzing');

-- Discovered patterns library
CREATE TABLE IF NOT EXISTS discovered_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES discovery_sessions(id),
  pattern_type VARCHAR(100), -- 'opening', 'pitch', 'rebuttal', 'close', 'lying'
  pattern_text TEXT,
  occurrence_count INT DEFAULT 1,
  success_rate DECIMAL(5,2),
  confidence_score DECIMAL(3,2),
  examples JSONB, -- Example quotes/transcripts
  metadata JSONB, -- Additional pattern metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for pattern search
CREATE INDEX IF NOT EXISTS idx_discovered_patterns_type
  ON discovered_patterns(pattern_type, success_rate DESC);

-- Agent baselines from discovery
CREATE TABLE IF NOT EXISTS agent_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255),
  agent_name VARCHAR(255),
  discovery_session_id UUID REFERENCES discovery_sessions(id),

  -- Performance metrics
  avg_opening_score INT,
  avg_closing_rate DECIMAL(5,2),
  avg_call_duration INT,
  avg_rebuttals_per_call DECIMAL(3,1),

  -- Pattern counts
  successful_patterns JSONB,
  failed_patterns JSONB,
  common_objections JSONB,

  -- Issues detected
  lying_instances INT DEFAULT 0,
  hangup_count INT DEFAULT 0,
  no_rebuttal_count INT DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for agent lookups
CREATE INDEX IF NOT EXISTS idx_agent_baselines_agent
  ON agent_baselines(agent_id, created_at DESC);

-- Campaign scripts discovered
CREATE TABLE IF NOT EXISTS campaign_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_session_id UUID REFERENCES discovery_sessions(id),
  campaign_name VARCHAR(255),

  -- Discovered script segments
  opening_variations JSONB,
  pitch_structures JSONB,
  rebuttal_scripts JSONB,
  closing_techniques JSONB,

  -- Performance by segment
  segment_success_rates JSONB,
  optimal_flow JSONB, -- Best performing sequence

  created_at TIMESTAMP DEFAULT NOW()
);

-- Lying detection records
CREATE TABLE IF NOT EXISTS lying_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_session_id UUID REFERENCES discovery_sessions(id),
  call_id UUID,

  pattern_type VARCHAR(100), -- 'dental_scam', 'price_deception', etc.
  severity VARCHAR(20), -- 'high', 'medium', 'low'
  quote TEXT, -- Exact quote from transcript
  timestamp_ms INT, -- When in the call it occurred

  agent_id VARCHAR(255),
  campaign VARCHAR(255),

  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for lying pattern analysis
CREATE INDEX IF NOT EXISTS idx_lying_detections_type
  ON lying_detections(pattern_type, severity);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_discovery_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updating timestamps
CREATE TRIGGER update_discovery_sessions_updated_at
  BEFORE UPDATE ON discovery_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_discovery_updated_at();

CREATE TRIGGER update_agent_baselines_updated_at
  BEFORE UPDATE ON agent_baselines
  FOR EACH ROW
  EXECUTE FUNCTION update_discovery_updated_at();

-- Grant permissions
GRANT ALL ON discovery_sessions TO authenticated;
GRANT ALL ON discovered_patterns TO authenticated;
GRANT ALL ON agent_baselines TO authenticated;
GRANT ALL ON campaign_scripts TO authenticated;
GRANT ALL ON lying_detections TO authenticated;