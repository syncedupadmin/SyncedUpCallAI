-- =====================================================
-- COMPLIANCE CONVOSO INTEGRATION MIGRATION
-- Adds Convoso-specific fields for compliance monitoring
-- =====================================================

-- 1. Add Convoso tracking fields to post_close_segments
ALTER TABLE post_close_segments
ADD COLUMN IF NOT EXISTS convoso_call_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS convoso_agent_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS convoso_campaign_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS convoso_list_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS convoso_disposition VARCHAR(50),
ADD COLUMN IF NOT EXISTS convoso_sync_at TIMESTAMPTZ;

-- Create index for Convoso lookups
CREATE INDEX IF NOT EXISTS idx_post_close_segments_convoso_call
  ON post_close_segments(convoso_call_id)
  WHERE convoso_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_post_close_segments_convoso_agent
  ON post_close_segments(convoso_agent_id)
  WHERE convoso_agent_id IS NOT NULL;

-- 2. Create compliance agent configuration table
CREATE TABLE IF NOT EXISTS compliance_agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  convoso_agent_id VARCHAR(255) NOT NULL,
  agent_name VARCHAR(255) NOT NULL,
  agent_email VARCHAR(255),
  monitor_enabled BOOLEAN DEFAULT true,
  compliance_threshold DECIMAL DEFAULT 90.0,
  alert_on_failure BOOLEAN DEFAULT true,
  auto_sync_sales BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  sync_status VARCHAR(50) DEFAULT 'pending',
  sync_error TEXT,
  total_sales_synced INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agency_id, convoso_agent_id)
);

-- Create indexes for agent config
CREATE INDEX IF NOT EXISTS idx_compliance_agent_config_agency
  ON compliance_agent_config(agency_id);

CREATE INDEX IF NOT EXISTS idx_compliance_agent_config_monitor
  ON compliance_agent_config(monitor_enabled)
  WHERE monitor_enabled = true;

CREATE INDEX IF NOT EXISTS idx_compliance_agent_config_sync
  ON compliance_agent_config(auto_sync_sales)
  WHERE auto_sync_sales = true;

-- 3. Add Convoso sync tracking to calls table
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS convoso_agent_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS convoso_campaign_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS convoso_list_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS convoso_disposition VARCHAR(50),
ADD COLUMN IF NOT EXISTS compliance_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS compliance_processed BOOLEAN DEFAULT false;

-- Create indexes for Convoso fields in calls
CREATE INDEX IF NOT EXISTS idx_calls_convoso_agent
  ON calls(convoso_agent_id)
  WHERE convoso_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calls_compliance_required
  ON calls(compliance_required)
  WHERE compliance_required = true;

CREATE INDEX IF NOT EXISTS idx_calls_compliance_pending
  ON calls(compliance_required, compliance_processed)
  WHERE compliance_required = true AND compliance_processed = false;

-- 4. Create Convoso sync log table
CREATE TABLE IF NOT EXISTS compliance_convoso_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  sync_type VARCHAR(50) NOT NULL, -- 'agent_discovery' or 'sales_fetch'
  agent_id VARCHAR(255),
  agent_name VARCHAR(255),
  date_range_start DATE,
  date_range_end DATE,
  calls_fetched INTEGER DEFAULT 0,
  sales_found INTEGER DEFAULT 0,
  compliance_segments_created INTEGER DEFAULT 0,
  sync_duration_ms INTEGER,
  sync_status VARCHAR(50) NOT NULL, -- 'success', 'partial', 'failed'
  error_message TEXT,
  api_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for sync log
CREATE INDEX IF NOT EXISTS idx_compliance_convoso_sync_log_agency
  ON compliance_convoso_sync_log(agency_id);

CREATE INDEX IF NOT EXISTS idx_compliance_convoso_sync_log_created
  ON compliance_convoso_sync_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_convoso_sync_log_status
  ON compliance_convoso_sync_log(sync_status);

-- 5. Enable RLS on new tables
ALTER TABLE compliance_agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_convoso_sync_log ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for new tables
CREATE POLICY compliance_agent_config_agency_isolation ON compliance_agent_config
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY compliance_convoso_sync_log_agency_isolation ON compliance_convoso_sync_log
  FOR ALL
  USING (
    public.is_super_admin() OR
    agency_id IN (
      SELECT agency_id FROM user_agencies WHERE user_id = auth.uid()
    )
  );

-- 7. Create function to mark sales calls for compliance
CREATE OR REPLACE FUNCTION mark_sales_for_compliance()
RETURNS TRIGGER AS $$
BEGIN
  -- If disposition is SALE, mark for compliance processing
  IF NEW.disposition = 'SALE' OR NEW.convoso_disposition = 'SALE' THEN
    NEW.compliance_required = true;
    NEW.compliance_processed = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger for automatic compliance marking
DROP TRIGGER IF EXISTS trigger_mark_sales_for_compliance ON calls;
CREATE TRIGGER trigger_mark_sales_for_compliance
  BEFORE INSERT OR UPDATE OF disposition, convoso_disposition ON calls
  FOR EACH ROW
  EXECUTE FUNCTION mark_sales_for_compliance();

-- 9. Create function to update agent config timestamp
CREATE OR REPLACE FUNCTION update_agent_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Create trigger for agent config updates
DROP TRIGGER IF EXISTS trigger_update_agent_config_timestamp ON compliance_agent_config;
CREATE TRIGGER trigger_update_agent_config_timestamp
  BEFORE UPDATE ON compliance_agent_config
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_config_timestamp();

-- 11. Grant permissions
GRANT ALL ON compliance_agent_config TO authenticated;
GRANT ALL ON compliance_convoso_sync_log TO authenticated;

-- 12. Add helper view for compliance dashboard
CREATE OR REPLACE VIEW compliance_agent_overview AS
SELECT
  cac.id,
  cac.agency_id,
  cac.convoso_agent_id,
  cac.agent_name,
  cac.monitor_enabled,
  cac.compliance_threshold,
  cac.last_synced_at,
  cac.sync_status,
  cac.total_sales_synced,
  COUNT(DISTINCT pc.id) FILTER (WHERE pc.analyzed_at >= NOW() - INTERVAL '7 days') as recent_analyses,
  AVG(pc.overall_score) FILTER (WHERE pc.analyzed_at >= NOW() - INTERVAL '7 days') as avg_score_7d,
  SUM(CASE WHEN pc.compliance_passed THEN 1 ELSE 0 END) FILTER (WHERE pc.analyzed_at >= NOW() - INTERVAL '7 days') as passed_7d,
  SUM(CASE WHEN NOT pc.compliance_passed THEN 1 ELSE 0 END) FILTER (WHERE pc.analyzed_at >= NOW() - INTERVAL '7 days') as failed_7d
FROM compliance_agent_config cac
LEFT JOIN post_close_segments pcs ON pcs.convoso_agent_id = cac.convoso_agent_id AND pcs.agency_id = cac.agency_id
LEFT JOIN post_close_compliance pc ON pc.segment_id = pcs.id
GROUP BY
  cac.id, cac.agency_id, cac.convoso_agent_id, cac.agent_name,
  cac.monitor_enabled, cac.compliance_threshold, cac.last_synced_at,
  cac.sync_status, cac.total_sales_synced;

-- Grant permissions for view
GRANT SELECT ON compliance_agent_overview TO authenticated;

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check if new columns were added
  SELECT COUNT(*)
  INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND table_name = 'post_close_segments'
  AND column_name LIKE 'convoso_%';

  RAISE NOTICE '';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Convoso Integration Migration Complete';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'New Convoso columns added: %', v_count;

  -- Check if agent config table was created
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'compliance_agent_config'
  ) THEN
    RAISE NOTICE '✅ Agent config table created';
  END IF;

  -- Check if sync log table was created
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'compliance_convoso_sync_log'
  ) THEN
    RAISE NOTICE '✅ Sync log table created';
  END IF;

  RAISE NOTICE '======================================';
  RAISE NOTICE 'Ready for Convoso compliance integration';
  RAISE NOTICE '======================================';
END $$;