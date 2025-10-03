-- Complete Post-Close Compliance Setup (FIXED VERSION)
-- This migration ensures all compliance tables and features are properly configured
-- Fixed to work with actual database schema (user_agencies instead of agency_members)

-- ============================================
-- 0. CREATE AGENCIES TABLE IF NOT EXISTS
-- ============================================

CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  owner_user_id UUID REFERENCES auth.users(id),
  product_type VARCHAR(100) DEFAULT 'all',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_agencies table if not exists
CREATE TABLE IF NOT EXISTS user_agencies (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'agent',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, agency_id)
);

-- Add indexes if not exists
CREATE INDEX IF NOT EXISTS idx_user_agencies_user_id ON user_agencies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agencies_agency_id ON user_agencies(agency_id);
CREATE INDEX IF NOT EXISTS idx_agencies_owner ON agencies(owner_user_id);

-- ============================================
-- 1. CREATE BASE TABLES (if not exists)
-- ============================================

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
  strict_mode BOOLEAN DEFAULT false, -- Added for strict word-for-word mode

  -- Upload info
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_filename VARCHAR(255),

  -- Multi-tenancy
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);

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

  -- Multi-tenancy
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,

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

  -- Multi-tenancy
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,

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

  -- Multi-tenancy
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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

  -- Multi-tenancy
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,

  -- When
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance notifications tracking
CREATE TABLE IF NOT EXISTS compliance_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,

  -- Alert details
  alert_type VARCHAR(50) NOT NULL, -- 'failure', 'flagged', 'low_score', 'missing_phrases'
  severity VARCHAR(20) NOT NULL, -- 'high', 'medium', 'low'

  -- Context
  agent_name VARCHAR(255),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  score DECIMAL,
  issues TEXT[],
  script_name VARCHAR(255),

  -- Recipients and delivery
  recipients TEXT[], -- Email addresses
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. ADD MISSING COLUMNS (if not exists)
-- ============================================

-- Add strict_mode column if it doesn't exist
ALTER TABLE post_close_scripts
ADD COLUMN IF NOT EXISTS strict_mode BOOLEAN DEFAULT false;

-- Add agency_id columns if they don't exist (for existing installations)
ALTER TABLE post_close_scripts
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

ALTER TABLE post_close_segments
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

ALTER TABLE post_close_compliance
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

ALTER TABLE agent_post_close_performance
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

ALTER TABLE post_close_audit_log
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Add agency_id to calls table if not exists (important for compliance)
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Add missing columns to calls table
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS agent_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS product_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS state VARCHAR(2);

-- ============================================
-- 3. CREATE INDEXES
-- ============================================

-- Drop old indexes if they exist
DROP INDEX IF EXISTS unique_active_script_idx;
DROP INDEX IF EXISTS idx_post_close_scripts_active;

-- Create new indexes
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

-- Add index for calls agency_id if not exists
CREATE INDEX IF NOT EXISTS idx_calls_agency ON calls(agency_id);

-- ============================================
-- 4. CREATE UNIQUE CONSTRAINTS
-- ============================================

-- Unique constraint: only one active script per product_type/state combo per agency
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_script_per_agency_idx
  ON post_close_scripts (agency_id, product_type, state)
  WHERE active = true;

-- Update performance tracking constraint to be per-agency
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

-- Drop existing policies if they exist
DROP POLICY IF EXISTS post_close_scripts_agency_isolation ON post_close_scripts;
DROP POLICY IF EXISTS post_close_segments_agency_isolation ON post_close_segments;
DROP POLICY IF EXISTS post_close_compliance_agency_isolation ON post_close_compliance;
DROP POLICY IF EXISTS agent_post_close_perf_agency_isolation ON agent_post_close_performance;
DROP POLICY IF EXISTS post_close_audit_agency_isolation ON post_close_audit_log;
DROP POLICY IF EXISTS compliance_notifications_agency_isolation ON compliance_notifications;

-- Create function to check if user is super admin (if not exists)
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

-- Policy: Users can only see scripts from their agencies
CREATE POLICY post_close_scripts_agency_isolation ON post_close_scripts
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can only see segments from their agencies
CREATE POLICY post_close_segments_agency_isolation ON post_close_segments
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can only see compliance results from their agencies
CREATE POLICY post_close_compliance_agency_isolation ON post_close_compliance
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can only see performance data from their agencies
CREATE POLICY agent_post_close_perf_agency_isolation ON agent_post_close_performance
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can only see audit logs from their agencies
CREATE POLICY post_close_audit_agency_isolation ON post_close_audit_log
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can only see notifications from their agencies
CREATE POLICY compliance_notifications_agency_isolation ON compliance_notifications
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id
      FROM user_agencies
      WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 7. CREATE TRIGGERS
-- ============================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_post_close_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_post_close_scripts_timestamp ON post_close_scripts;
DROP TRIGGER IF EXISTS update_agent_post_close_perf_timestamp ON agent_post_close_performance;
DROP TRIGGER IF EXISTS trigger_log_script_activation ON post_close_scripts;

-- Create triggers
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

-- Grant permissions on agencies tables if they exist
GRANT ALL ON agencies TO authenticated;
GRANT ALL ON user_agencies TO authenticated;

-- ============================================
-- 9. ADD HELPFUL COMMENTS
-- ============================================

COMMENT ON TABLE post_close_scripts IS 'Master post-close scripts that agents must read verbatim';
COMMENT ON TABLE post_close_segments IS 'Extracted post-close segments from call recordings';
COMMENT ON TABLE post_close_compliance IS 'Compliance analysis results comparing segments to required scripts';
COMMENT ON TABLE agent_post_close_performance IS 'Agent compliance performance tracking';
COMMENT ON TABLE post_close_audit_log IS 'Audit log for script changes and compliance actions';
COMMENT ON TABLE compliance_notifications IS 'Tracking of compliance alert notifications sent';

COMMENT ON COLUMN post_close_scripts.agency_id IS 'Agency that owns this script - scripts are isolated per agency';
COMMENT ON COLUMN post_close_segments.agency_id IS 'Agency that owns the call this segment came from';
COMMENT ON COLUMN post_close_compliance.agency_id IS 'Agency that owns this compliance result';
COMMENT ON COLUMN agent_post_close_performance.agency_id IS 'Agency this performance data belongs to';
COMMENT ON COLUMN post_close_audit_log.agency_id IS 'Agency this audit log entry belongs to';
COMMENT ON COLUMN post_close_scripts.strict_mode IS 'When true, requires 100% exact word matching with 98% min score; when false, uses fuzzy matching with 80% threshold';

-- ============================================
-- 10. VERIFY SETUP
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Post-Close Compliance Setup Complete!';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created/verified:';
  RAISE NOTICE '  ✓ agencies';
  RAISE NOTICE '  ✓ user_agencies';
  RAISE NOTICE '  ✓ post_close_scripts';
  RAISE NOTICE '  ✓ post_close_segments';
  RAISE NOTICE '  ✓ post_close_compliance';
  RAISE NOTICE '  ✓ agent_post_close_performance';
  RAISE NOTICE '  ✓ post_close_audit_log';
  RAISE NOTICE '  ✓ compliance_notifications';
  RAISE NOTICE '';
  RAISE NOTICE 'Features enabled:';
  RAISE NOTICE '  ✓ Multi-tenancy with agency_id columns';
  RAISE NOTICE '  ✓ Row Level Security (RLS) for agency isolation';
  RAISE NOTICE '  ✓ Automatic triggers for timestamps and logging';
  RAISE NOTICE '  ✓ Indexes for optimal query performance';
  RAISE NOTICE '';
  RAISE NOTICE 'Ready for production use!';
  RAISE NOTICE '==========================================';
END $$;