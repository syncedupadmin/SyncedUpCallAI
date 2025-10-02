-- Add Agency Multi-Tenancy to Post-Close Compliance System
-- Each agency should have their own scripts, compliance results, and performance tracking

-- Add agency_id to post_close_scripts
ALTER TABLE post_close_scripts
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Add agency_id to post_close_segments
ALTER TABLE post_close_segments
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Add agency_id to post_close_compliance
ALTER TABLE post_close_compliance
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Add agency_id to agent_post_close_performance
ALTER TABLE agent_post_close_performance
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Add agency_id to post_close_audit_log
ALTER TABLE post_close_audit_log
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;

-- Update indexes to include agency_id for better performance
CREATE INDEX IF NOT EXISTS idx_post_close_scripts_agency ON post_close_scripts(agency_id);
CREATE INDEX IF NOT EXISTS idx_post_close_segments_agency ON post_close_segments(agency_id);
CREATE INDEX IF NOT EXISTS idx_post_close_compliance_agency ON post_close_compliance(agency_id);
CREATE INDEX IF NOT EXISTS idx_agent_post_close_perf_agency ON agent_post_close_performance(agency_id);
CREATE INDEX IF NOT EXISTS idx_post_close_audit_agency ON post_close_audit_log(agency_id);

-- Update unique constraint to be per-agency (drop old one, add new one)
DROP INDEX IF EXISTS unique_active_script_idx;
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_script_per_agency_idx
  ON post_close_scripts (agency_id, product_type, state)
  WHERE active = true;

-- Update performance tracking constraint to be per-agency
ALTER TABLE agent_post_close_performance
DROP CONSTRAINT IF EXISTS unique_agent_period;

ALTER TABLE agent_post_close_performance
ADD CONSTRAINT unique_agent_period_per_agency
UNIQUE (agency_id, agent_name, period_start, period_end);

-- Add RLS policies
ALTER TABLE post_close_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_close_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_close_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_post_close_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_close_audit_log ENABLE ROW LEVEL SECURITY;

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

-- Add helpful comments
COMMENT ON COLUMN post_close_scripts.agency_id IS 'Agency that owns this script - scripts are isolated per agency';
COMMENT ON COLUMN post_close_segments.agency_id IS 'Agency that owns the call this segment came from';
COMMENT ON COLUMN post_close_compliance.agency_id IS 'Agency that owns this compliance result';
COMMENT ON COLUMN agent_post_close_performance.agency_id IS 'Agency this performance data belongs to';
COMMENT ON COLUMN post_close_audit_log.agency_id IS 'Agency this audit log entry belongs to';
