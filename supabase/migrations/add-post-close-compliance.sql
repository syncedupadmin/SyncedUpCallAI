-- Post Close Compliance System
-- Verifies agents read required terms & conditions scripts verbatim after card collection

-- Master scripts (uploadable/editable)
CREATE TABLE IF NOT EXISTS post_close_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Script metadata
  script_name VARCHAR(255) NOT NULL,
  script_version VARCHAR(50) DEFAULT '1.0',
  product_type VARCHAR(100), -- 'Medicare', 'Supplement', 'All', etc.
  state VARCHAR(2), -- For state-specific scripts

  -- Script content
  script_text TEXT NOT NULL,
  required_phrases TEXT[] DEFAULT '{}', -- Critical phrases that MUST appear
  optional_phrases TEXT[] DEFAULT '{}', -- Recommended but not required

  -- Ordering & sequence
  phrase_sequence JSONB, -- Expected order of key phrases

  -- Status
  active BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'active', 'archived'

  -- Configuration
  min_word_match_percentage DECIMAL DEFAULT 85.0, -- Minimum % to pass
  fuzzy_match_threshold DECIMAL DEFAULT 0.8, -- Levenshtein similarity threshold
  allow_minor_variations BOOLEAN DEFAULT true,

  -- Upload info
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_filename VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);

-- Unique constraint: only one active script per product_type/state combo
-- Note: In PostgreSQL, NULL values are considered distinct, so this works correctly
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_script_idx
  ON post_close_scripts (product_type, state)
  WHERE active = true;

-- Extracted post-close segments from calls
CREATE TABLE IF NOT EXISTS post_close_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,

  -- Segment location
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  duration_sec INTEGER,

  -- Content
  transcript TEXT NOT NULL,
  words JSONB, -- Word-level timing from ASR

  -- Context
  card_collection_timestamp_ms INTEGER, -- When card was collected (before this segment)
  sale_confirmed BOOLEAN DEFAULT false,
  disposition VARCHAR(50),

  -- Metadata
  agent_name VARCHAR(255),
  campaign VARCHAR(255),

  -- Extraction info
  extraction_method VARCHAR(50) DEFAULT 'auto', -- 'auto', 'manual'
  extracted_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance analysis results
CREATE TABLE IF NOT EXISTS post_close_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  segment_id UUID REFERENCES post_close_segments(id) ON DELETE CASCADE,
  script_id UUID REFERENCES post_close_scripts(id),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,

  -- Overall scoring
  overall_score DECIMAL NOT NULL, -- 0-100
  compliance_passed BOOLEAN NOT NULL,

  -- Detailed matching
  word_match_percentage DECIMAL, -- % of script words matched
  phrase_match_percentage DECIMAL, -- % of required phrases found
  sequence_score DECIMAL, -- Did phrases appear in correct order?

  -- Detected issues
  missing_phrases TEXT[] DEFAULT '{}',
  paraphrased_sections JSONB DEFAULT '[]', -- [{original: "", actual: "", similarity: 0.7}]
  sequence_errors JSONB DEFAULT '[]', -- Phrases out of order
  extra_content TEXT[], -- Non-script content inserted

  -- Fuzzy matching details
  levenshtein_distance INTEGER,
  similarity_score DECIMAL,

  -- Flagging
  flagged_for_review BOOLEAN DEFAULT false,
  flag_reasons TEXT[] DEFAULT '{}',
  reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Metadata
  agent_name VARCHAR(255),
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  analysis_version VARCHAR(20) DEFAULT '1.0',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent performance tracking
CREATE TABLE IF NOT EXISTS agent_post_close_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR(255) NOT NULL,

  -- Time period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Performance metrics
  total_analyzed INTEGER DEFAULT 0,
  total_passed INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  pass_rate DECIMAL,

  -- Scoring
  avg_compliance_score DECIMAL,
  avg_word_match_percentage DECIMAL,
  avg_phrase_match_percentage DECIMAL,

  -- Issues
  total_violations INTEGER DEFAULT 0,
  common_missing_phrases TEXT[] DEFAULT '{}',
  paraphrase_frequency DECIMAL, -- How often they paraphrase

  -- Quality
  flagged_count INTEGER DEFAULT 0,
  reviewed_count INTEGER DEFAULT 0,

  -- Top script used
  most_used_script_id UUID REFERENCES post_close_scripts(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate periods for same agent
  CONSTRAINT unique_agent_period UNIQUE (agent_name, period_start, period_end)
);

-- Compliance audit log
CREATE TABLE IF NOT EXISTS post_close_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What happened
  action VARCHAR(50) NOT NULL, -- 'script_uploaded', 'script_activated', 'compliance_flagged', etc.
  entity_type VARCHAR(50), -- 'script', 'segment', 'compliance'
  entity_id UUID,

  -- Who did it
  user_id UUID REFERENCES auth.users(id),
  user_email VARCHAR(255),

  -- Details
  details JSONB,

  -- When
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_post_close_scripts_active ON post_close_scripts(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_post_close_scripts_product ON post_close_scripts(product_type);
CREATE INDEX IF NOT EXISTS idx_post_close_scripts_status ON post_close_scripts(status);

CREATE INDEX IF NOT EXISTS idx_post_close_segments_call ON post_close_segments(call_id);
CREATE INDEX IF NOT EXISTS idx_post_close_segments_agent ON post_close_segments(agent_name);
CREATE INDEX IF NOT EXISTS idx_post_close_segments_created ON post_close_segments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_close_compliance_segment ON post_close_compliance(segment_id);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_script ON post_close_compliance(script_id);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_call ON post_close_compliance(call_id);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_score ON post_close_compliance(overall_score);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_passed ON post_close_compliance(compliance_passed);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_flagged ON post_close_compliance(flagged_for_review) WHERE flagged_for_review = true;
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_agent ON post_close_compliance(agent_name);

CREATE INDEX IF NOT EXISTS idx_agent_post_close_perf_agent ON agent_post_close_performance(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_post_close_perf_period ON agent_post_close_performance(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_post_close_audit_entity ON post_close_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_post_close_audit_created ON post_close_audit_log(created_at DESC);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_post_close_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_post_close_scripts_timestamp
  BEFORE UPDATE ON post_close_scripts
  FOR EACH ROW
  EXECUTE FUNCTION update_post_close_timestamp();

CREATE TRIGGER update_agent_post_close_perf_timestamp
  BEFORE UPDATE ON agent_post_close_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_post_close_timestamp();

-- Trigger to log script activation
CREATE OR REPLACE FUNCTION log_script_activation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.active = true AND (OLD.active = false OR OLD.active IS NULL) THEN
    INSERT INTO post_close_audit_log (action, entity_type, entity_id, details)
    VALUES (
      'script_activated',
      'script',
      NEW.id,
      jsonb_build_object(
        'script_name', NEW.script_name,
        'version', NEW.script_version,
        'product_type', NEW.product_type
      )
    );

    NEW.activated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_script_activation
  BEFORE UPDATE ON post_close_scripts
  FOR EACH ROW
  EXECUTE FUNCTION log_script_activation();

-- Grant permissions
GRANT ALL ON post_close_scripts TO authenticated;
GRANT ALL ON post_close_segments TO authenticated;
GRANT ALL ON post_close_compliance TO authenticated;
GRANT ALL ON agent_post_close_performance TO authenticated;
GRANT ALL ON post_close_audit_log TO authenticated;

-- Helpful comments
COMMENT ON TABLE post_close_scripts IS 'Master post-close scripts that agents must read verbatim';
COMMENT ON TABLE post_close_segments IS 'Extracted post-close segments from call recordings';
COMMENT ON TABLE post_close_compliance IS 'Compliance analysis results comparing segments to required scripts';
COMMENT ON TABLE agent_post_close_performance IS 'Agent compliance performance tracking';
COMMENT ON TABLE post_close_audit_log IS 'Audit log for script changes and compliance actions';
