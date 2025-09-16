-- Pattern Analysis Tables for AI Training and Call Analytics
-- This migration adds tables for discovering patterns in historical recordings

-- Store discovered call patterns from analysis
CREATE TABLE IF NOT EXISTS call_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type VARCHAR(50) NOT NULL, -- 'opening', 'pitch', 'objection', 'close', 'transition'
  pattern_text TEXT NOT NULL, -- The actual phrase or pattern discovered
  disposition VARCHAR(50), -- Which disposition this pattern leads to
  success_rate FLOAT, -- Success rate of this pattern (0.0 to 1.0)
  occurrence_count INT DEFAULT 1, -- How many times we've seen this pattern
  avg_call_duration INT, -- Average call duration when this pattern is used
  conversion_rate FLOAT, -- Conversion rate when this pattern is used
  metadata JSONB DEFAULT '{}', -- Additional metadata (campaign, agent group, etc)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient pattern lookups
CREATE INDEX idx_patterns_type_disposition ON call_patterns(pattern_type, disposition);
CREATE INDEX idx_patterns_success_rate ON call_patterns(success_rate DESC);
CREATE INDEX idx_patterns_occurrence ON call_patterns(occurrence_count DESC);

-- Store call segment analysis for granular insights
CREATE TABLE IF NOT EXISTS call_segments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  segment_type VARCHAR(50) NOT NULL, -- 'opening', 'pitch', 'objection', 'close'
  segment_number INT DEFAULT 1, -- Order of segment in call (1st objection, 2nd objection, etc)
  start_seconds INT NOT NULL, -- Start time in seconds from call start
  end_seconds INT NOT NULL, -- End time in seconds from call start
  transcript_text TEXT, -- Raw transcript for this segment
  compliance_score INT, -- 0-100 score for script compliance
  effectiveness_score INT, -- 0-100 score for effectiveness
  sentiment_score FLOAT, -- -1.0 to 1.0 sentiment analysis
  key_phrases TEXT[], -- Important phrases detected in this segment
  objection_type VARCHAR(100), -- For objection segments: 'price', 'trust', 'timing', etc
  objection_handled BOOLEAN, -- Was the objection successfully handled?
  close_attempt_type VARCHAR(100), -- For close segments: 'assumptive', 'urgency', 'scarcity', etc
  close_successful BOOLEAN, -- Did the close attempt succeed?
  metadata JSONB DEFAULT '{}', -- Additional segment-specific data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for segment analysis
CREATE INDEX idx_segments_call ON call_segments(call_id);
CREATE INDEX idx_segments_type ON call_segments(segment_type);
CREATE INDEX idx_segments_compliance ON call_segments(compliance_score DESC);
CREATE INDEX idx_segments_effectiveness ON call_segments(effectiveness_score DESC);

-- Store aggregated disposition analysis
CREATE TABLE IF NOT EXISTS disposition_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  disposition VARCHAR(50) NOT NULL UNIQUE,
  disposition_type VARCHAR(20) NOT NULL, -- 'human' or 'system'
  total_calls INT DEFAULT 0,
  avg_duration_sec INT,
  avg_compliance_score INT,
  common_patterns JSONB DEFAULT '[]', -- Array of common patterns for this disposition
  success_indicators TEXT[], -- Phrases that indicate this disposition
  failure_indicators TEXT[], -- Phrases that prevent this disposition
  recommended_responses JSONB DEFAULT '[]', -- AI-generated recommended responses
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for disposition lookups
CREATE INDEX idx_disposition_analysis_type ON disposition_analysis(disposition_type);

-- Store script templates and compliance criteria
CREATE TABLE IF NOT EXISTS script_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_name VARCHAR(255) NOT NULL,
  campaign VARCHAR(255),
  segment_type VARCHAR(50) NOT NULL, -- 'opening', 'pitch', 'objection', 'close'
  template_text TEXT NOT NULL, -- The ideal script
  required_elements TEXT[], -- Must-mention elements
  prohibited_elements TEXT[], -- Must-not-mention elements
  scoring_criteria JSONB, -- Detailed scoring rules
  min_duration_sec INT, -- Minimum expected duration
  max_duration_sec INT, -- Maximum expected duration
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for template lookups
CREATE INDEX idx_script_templates_campaign ON script_templates(campaign);
CREATE INDEX idx_script_templates_segment ON script_templates(segment_type);

-- Store AI training data exports
CREATE TABLE IF NOT EXISTS training_exports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  export_name VARCHAR(255) NOT NULL,
  export_type VARCHAR(50) NOT NULL, -- 'patterns', 'segments', 'full_calls'
  date_range_start DATE,
  date_range_end DATE,
  disposition_filter VARCHAR(50)[],
  record_count INT,
  export_data JSONB, -- The actual training data
  s3_url TEXT, -- If exported to S3/storage
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create view for pattern effectiveness
CREATE OR REPLACE VIEW pattern_effectiveness AS
SELECT
  cp.pattern_type,
  cp.pattern_text,
  cp.disposition,
  cp.success_rate,
  cp.occurrence_count,
  cp.conversion_rate,
  da.disposition_type,
  CASE
    WHEN cp.success_rate > 0.7 THEN 'high'
    WHEN cp.success_rate > 0.4 THEN 'medium'
    ELSE 'low'
  END as effectiveness_tier
FROM call_patterns cp
LEFT JOIN disposition_analysis da ON da.disposition = cp.disposition
ORDER BY cp.success_rate DESC, cp.occurrence_count DESC;

-- Create view for agent performance by segment
CREATE OR REPLACE VIEW agent_segment_performance AS
SELECT
  c.agent_name,
  cs.segment_type,
  COUNT(DISTINCT cs.call_id) as call_count,
  AVG(cs.compliance_score) as avg_compliance,
  AVG(cs.effectiveness_score) as avg_effectiveness,
  AVG(cs.sentiment_score) as avg_sentiment,
  COUNT(CASE WHEN cs.objection_handled = true THEN 1 END) as objections_handled,
  COUNT(CASE WHEN cs.close_successful = true THEN 1 END) as successful_closes
FROM call_segments cs
JOIN calls c ON c.id = cs.call_id
WHERE c.agent_name IS NOT NULL
GROUP BY c.agent_name, cs.segment_type;

-- Add comments for documentation
COMMENT ON TABLE call_patterns IS 'Discovered patterns from historical call analysis for AI training';
COMMENT ON TABLE call_segments IS 'Granular analysis of call segments (openings, pitches, objections, closes)';
COMMENT ON TABLE disposition_analysis IS 'Aggregated analysis by disposition type with success indicators';
COMMENT ON TABLE script_templates IS 'Script compliance templates and scoring criteria';
COMMENT ON TABLE training_exports IS 'Exported training data for AI model improvement';

-- Grant permissions (adjust based on your roles)
GRANT SELECT ON call_patterns TO authenticated;
GRANT SELECT ON call_segments TO authenticated;
GRANT SELECT ON disposition_analysis TO authenticated;
GRANT SELECT ON pattern_effectiveness TO authenticated;
GRANT SELECT ON agent_segment_performance TO authenticated;