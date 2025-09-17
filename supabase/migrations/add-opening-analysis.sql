-- Opening Analysis System - Production Ready
-- Analyzes call openings to discover successful patterns

-- Store extracted opening segments from real calls
CREATE TABLE IF NOT EXISTS opening_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,

  -- Audio segment data
  recording_url TEXT NOT NULL,
  start_ms INTEGER DEFAULT 0,
  end_ms INTEGER DEFAULT 30000, -- First 30 seconds

  -- Transcript with timing
  transcript TEXT,
  words JSONB, -- Word-level timing from ASR

  -- Acoustic features
  pace_wpm DECIMAL, -- Words per minute
  silence_ratio DECIMAL, -- Percentage of silence
  energy_level DECIMAL, -- Volume/enthusiasm (future enhancement)

  -- Linguistic features
  greeting_type VARCHAR(50), -- "hello", "hi", "good morning", etc.
  company_mentioned BOOLEAN DEFAULT false,
  agent_name_mentioned BOOLEAN DEFAULT false,
  value_prop_mentioned BOOLEAN DEFAULT false,
  question_asked BOOLEAN DEFAULT false,

  -- Outcomes from actual call data
  call_continued BOOLEAN, -- Did call go past 30s?
  prospect_responded BOOLEAN, -- Did prospect speak?
  disposition VARCHAR(50), -- Final call disposition
  duration_sec INTEGER, -- Total call duration

  -- Performance metrics
  success_score DECIMAL, -- Calculated success probability
  engagement_score DECIMAL, -- Engagement level

  -- Metadata
  agent_name VARCHAR(255),
  campaign VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Discovered patterns from YOUR data
CREATE TABLE IF NOT EXISTS opening_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_name VARCHAR(100),
  pattern_type VARCHAR(50), -- 'greeting', 'introduction', 'hook', 'full_opening'

  -- Pattern template from real successful calls
  example_transcript TEXT,
  pattern_template TEXT, -- e.g., "Hi {name}, this is {agent} from {company}"
  key_phrases TEXT[], -- Phrases that appear in successful calls

  -- Performance metrics from YOUR actual calls
  sample_count INTEGER DEFAULT 0,
  success_rate DECIMAL, -- % that led to successful outcome
  continuation_rate DECIMAL, -- % that continued past 30s
  avg_duration_sec DECIMAL, -- Average total call duration
  conversion_rate DECIMAL, -- % that resulted in sale/appointment

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used TIMESTAMPTZ,

  -- Statistical confidence
  confidence_score DECIMAL, -- Statistical confidence in pattern
  p_value DECIMAL, -- Statistical significance

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- A/B testing for opening variations
CREATE TABLE IF NOT EXISTS opening_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'paused'

  -- Test variants
  control_pattern UUID REFERENCES opening_patterns(id),
  variant_pattern UUID REFERENCES opening_patterns(id),

  -- Test parameters
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  minimum_sample_size INTEGER DEFAULT 100,

  -- Results
  control_count INTEGER DEFAULT 0,
  control_success INTEGER DEFAULT 0,
  variant_count INTEGER DEFAULT 0,
  variant_success INTEGER DEFAULT 0,

  -- Statistical analysis
  confidence_level DECIMAL,
  winner VARCHAR(20), -- 'control', 'variant', 'no_difference'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent opening performance tracking
CREATE TABLE IF NOT EXISTS agent_opening_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR(255),

  -- Performance metrics
  total_calls INTEGER DEFAULT 0,
  avg_opening_score DECIMAL,
  continuation_rate DECIMAL,
  conversion_rate DECIMAL,

  -- Best performing patterns
  top_pattern_ids UUID[],

  -- Time period
  period_start DATE,
  period_end DATE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training data for ML models
CREATE TABLE IF NOT EXISTS opening_training_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_segment_id UUID REFERENCES opening_segments(id),

  -- Labels for supervised learning
  label VARCHAR(20), -- 'success', 'failure', 'neutral'
  confidence DECIMAL, -- Labeling confidence

  -- Features for training
  features JSONB, -- All extracted features

  -- Model tracking
  used_in_training BOOLEAN DEFAULT false,
  model_version VARCHAR(50),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_opening_segments_call ON opening_segments(call_id);
CREATE INDEX IF NOT EXISTS idx_opening_segments_success ON opening_segments(success_score DESC);
CREATE INDEX IF NOT EXISTS idx_opening_segments_agent ON opening_segments(agent_name);
CREATE INDEX IF NOT EXISTS idx_opening_segments_created ON opening_segments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opening_segments_disposition ON opening_segments(disposition);

CREATE INDEX IF NOT EXISTS idx_opening_patterns_success ON opening_patterns(success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_opening_patterns_type ON opening_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_opening_patterns_usage ON opening_patterns(times_used DESC);

CREATE INDEX IF NOT EXISTS idx_opening_tests_status ON opening_tests(status);
CREATE INDEX IF NOT EXISTS idx_agent_performance_agent ON agent_opening_performance(agent_name);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_opening_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_opening_segments_timestamp
  BEFORE UPDATE ON opening_segments
  FOR EACH ROW
  EXECUTE FUNCTION update_opening_timestamp();

CREATE TRIGGER update_opening_patterns_timestamp
  BEFORE UPDATE ON opening_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_opening_timestamp();

-- Grant permissions
GRANT ALL ON opening_segments TO authenticated;
GRANT ALL ON opening_patterns TO authenticated;
GRANT ALL ON opening_tests TO authenticated;
GRANT ALL ON agent_opening_performance TO authenticated;
GRANT ALL ON opening_training_data TO authenticated;

-- Helpful comments
COMMENT ON TABLE opening_segments IS 'Extracted opening segments from call recordings for analysis';
COMMENT ON TABLE opening_patterns IS 'Discovered successful opening patterns from real call data';
COMMENT ON TABLE opening_tests IS 'A/B testing framework for opening variations';
COMMENT ON TABLE agent_opening_performance IS 'Track agent performance on openings';
COMMENT ON TABLE opening_training_data IS 'Training data for ML models';