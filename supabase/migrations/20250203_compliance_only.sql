-- Post-Close Compliance Tables Only (if agencies/user_agencies already exist)
-- Use this if you already have agencies and user_agencies tables set up

-- ============================================
-- 1. CREATE COMPLIANCE TABLES
-- ============================================

-- Master scripts (uploadable/editable)
CREATE TABLE IF NOT EXISTS post_close_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_name VARCHAR(255) NOT NULL,
  script_version VARCHAR(50) DEFAULT '1.0',
  product_type VARCHAR(100),
  state VARCHAR(2),
  script_text TEXT NOT NULL,
  required_phrases TEXT[] DEFAULT '{}',
  optional_phrases TEXT[] DEFAULT '{}',
  phrase_sequence JSONB,
  active BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'draft',
  min_word_match_percentage DECIMAL DEFAULT 85.0,
  fuzzy_match_threshold DECIMAL DEFAULT 0.8,
  allow_minor_variations BOOLEAN DEFAULT true,
  strict_mode BOOLEAN DEFAULT false,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_filename VARCHAR(255),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);

-- Extracted post-close segments from calls
CREATE TABLE IF NOT EXISTS post_close_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  duration_sec INTEGER,
  transcript TEXT NOT NULL,
  words JSONB,
  card_collection_timestamp_ms INTEGER,
  sale_confirmed BOOLEAN DEFAULT false,
  disposition VARCHAR(50),
  agent_name VARCHAR(255),
  campaign VARCHAR(255),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  extraction_method VARCHAR(50) DEFAULT 'auto',
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance analysis results
CREATE TABLE IF NOT EXISTS post_close_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID REFERENCES post_close_segments(id) ON DELETE CASCADE,
  script_id UUID REFERENCES post_close_scripts(id),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  overall_score DECIMAL NOT NULL,
  compliance_passed BOOLEAN NOT NULL,
  word_match_percentage DECIMAL,
  phrase_match_percentage DECIMAL,
  sequence_score DECIMAL,
  missing_phrases TEXT[] DEFAULT '{}',
  paraphrased_sections JSONB DEFAULT '[]',
  sequence_errors JSONB DEFAULT '[]',
  extra_content TEXT[],
  levenshtein_distance INTEGER,
  similarity_score DECIMAL,
  flagged_for_review BOOLEAN DEFAULT false,
  flag_reasons TEXT[] DEFAULT '{}',
  reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  agent_name VARCHAR(255),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  analysis_version VARCHAR(20) DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent performance tracking
CREATE TABLE IF NOT EXISTS agent_post_close_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR(255) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_analyzed INTEGER DEFAULT 0,
  total_passed INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  pass_rate DECIMAL,
  avg_compliance_score DECIMAL,
  avg_word_match_percentage DECIMAL,
  avg_phrase_match_percentage DECIMAL,
  total_violations INTEGER DEFAULT 0,
  common_missing_phrases TEXT[] DEFAULT '{}',
  paraphrase_frequency DECIMAL,
  flagged_count INTEGER DEFAULT 0,
  reviewed_count INTEGER DEFAULT 0,
  most_used_script_id UUID REFERENCES post_close_scripts(id),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance audit log
CREATE TABLE IF NOT EXISTS post_close_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  user_id UUID REFERENCES auth.users(id),
  user_email VARCHAR(255),
  details JSONB,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance notifications tracking
CREATE TABLE IF NOT EXISTS compliance_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  agent_name VARCHAR(255),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  score DECIMAL,
  issues TEXT[],
  script_name VARCHAR(255),
  recipients TEXT[],
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. ADD AGENCY_ID TO CALLS (if not exists)
-- ============================================

ALTER TABLE calls
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

ALTER TABLE calls
ADD COLUMN IF NOT EXISTS agent_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS product_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(2);

-- ============================================
-- 3. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_post_close_scripts_active ON post_close_scripts(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_post_close_scripts_product ON post_close_scripts(product_type);
CREATE INDEX IF NOT EXISTS idx_post_close_scripts_status ON post_close_scripts(status);
CREATE INDEX IF NOT EXISTS idx_post_close_scripts_agency ON post_close_scripts(agency_id);

CREATE INDEX IF NOT EXISTS idx_post_close_segments_call ON post_close_segments(call_id);
CREATE INDEX IF NOT EXISTS idx_post_close_segments_agent ON post_close_segments(agent_name);
CREATE INDEX IF NOT EXISTS idx_post_close_segments_created ON post_close_segments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_close_segments_agency ON post_close_segments(agency_id);

CREATE INDEX IF NOT EXISTS idx_post_close_compliance_segment ON post_close_compliance(segment_id);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_script ON post_close_compliance(script_id);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_call ON post_close_compliance(call_id);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_score ON post_close_compliance(overall_score);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_passed ON post_close_compliance(compliance_passed);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_flagged ON post_close_compliance(flagged_for_review) WHERE flagged_for_review = true;
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_agent ON post_close_compliance(agent_name);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_agency ON post_close_compliance(agency_id);

CREATE INDEX IF NOT EXISTS idx_agent_post_close_perf_agent ON agent_post_close_performance(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_post_close_perf_period ON agent_post_close_performance(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_agent_post_close_perf_agency ON agent_post_close_performance(agency_id);

CREATE INDEX IF NOT EXISTS idx_post_close_audit_entity ON post_close_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_post_close_audit_created ON post_close_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_close_audit_agency ON post_close_audit_log(agency_id);

CREATE INDEX IF NOT EXISTS idx_compliance_notifications_agency ON compliance_notifications(agency_id);
CREATE INDEX IF NOT EXISTS idx_compliance_notifications_call ON compliance_notifications(call_id);
CREATE INDEX IF NOT EXISTS idx_compliance_notifications_status ON compliance_notifications(status);
CREATE INDEX IF NOT EXISTS idx_compliance_notifications_created ON compliance_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calls_agency ON calls(agency_id);

-- ============================================
-- 4. CREATE UNIQUE CONSTRAINTS
-- ============================================

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_script_per_agency_idx
  ON post_close_scripts (agency_id, product_type, state)
  WHERE active = true;

ALTER TABLE agent_post_close_performance
DROP CONSTRAINT IF EXISTS unique_agent_period;

ALTER TABLE agent_post_close_performance
DROP CONSTRAINT IF EXISTS unique_agent_period_per_agency;

ALTER TABLE agent_post_close_performance
ADD CONSTRAINT unique_agent_period_per_agency
UNIQUE (agency_id, agent_name, period_start, period_end);

-- ============================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE post_close_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_close_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_close_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_post_close_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_close_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. CREATE RLS POLICIES
-- ============================================

-- Create is_super_admin function if not exists
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (raw_user_meta_data->>'is_super_admin')::boolean = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing policies
DROP POLICY IF EXISTS post_close_scripts_agency_isolation ON post_close_scripts;
DROP POLICY IF EXISTS post_close_segments_agency_isolation ON post_close_segments;
DROP POLICY IF EXISTS post_close_compliance_agency_isolation ON post_close_compliance;
DROP POLICY IF EXISTS agent_post_close_perf_agency_isolation ON agent_post_close_performance;
DROP POLICY IF EXISTS post_close_audit_agency_isolation ON post_close_audit_log;
DROP POLICY IF EXISTS compliance_notifications_agency_isolation ON compliance_notifications;

-- Create RLS policies using user_agencies table
CREATE POLICY post_close_scripts_agency_isolation ON post_close_scripts
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY post_close_segments_agency_isolation ON post_close_segments
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY post_close_compliance_agency_isolation ON post_close_compliance
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY agent_post_close_perf_agency_isolation ON agent_post_close_performance
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY post_close_audit_agency_isolation ON post_close_audit_log
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY compliance_notifications_agency_isolation ON compliance_notifications
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 7. CREATE TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_post_close_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_post_close_scripts_timestamp ON post_close_scripts;
DROP TRIGGER IF EXISTS update_agent_post_close_perf_timestamp ON agent_post_close_performance;
DROP TRIGGER IF EXISTS trigger_log_script_activation ON post_close_scripts;

CREATE TRIGGER update_post_close_scripts_timestamp
  BEFORE UPDATE ON post_close_scripts
  FOR EACH ROW
  EXECUTE FUNCTION update_post_close_timestamp();

CREATE TRIGGER update_agent_post_close_perf_timestamp
  BEFORE UPDATE ON agent_post_close_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_post_close_timestamp();

CREATE OR REPLACE FUNCTION log_script_activation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.active = true AND (OLD.active = false OR OLD.active IS NULL) THEN
    INSERT INTO post_close_audit_log (action, entity_type, entity_id, agency_id, details)
    VALUES (
      'script_activated',
      'script',
      NEW.id,
      NEW.agency_id,
      jsonb_build_object(
        'script_name', NEW.script_name,
        'version', NEW.script_version,
        'product_type', NEW.product_type,
        'strict_mode', NEW.strict_mode
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

-- ============================================
-- 8. GRANT PERMISSIONS
-- ============================================

GRANT ALL ON post_close_scripts TO authenticated;
GRANT ALL ON post_close_segments TO authenticated;
GRANT ALL ON post_close_compliance TO authenticated;
GRANT ALL ON agent_post_close_performance TO authenticated;
GRANT ALL ON post_close_audit_log TO authenticated;
GRANT ALL ON compliance_notifications TO authenticated;

-- ============================================
-- 9. FINAL VERIFICATION
-- ============================================

DO $$
DECLARE
  v_tables_created INTEGER;
BEGIN
  -- Count created tables
  SELECT COUNT(*)
  INTO v_tables_created
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN (
    'post_close_scripts',
    'post_close_segments',
    'post_close_compliance',
    'agent_post_close_performance',
    'post_close_audit_log',
    'compliance_notifications'
  );

  RAISE NOTICE '';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Compliance Setup Complete!';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Tables created: % of 6', v_tables_created;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Upload a compliance script';
  RAISE NOTICE '2. Activate the script';
  RAISE NOTICE '3. Process calls to test';
  RAISE NOTICE '======================================';
END $$;