-- Rejection Analysis System
-- Tracks and analyzes rejection handling, rebuttals, and their outcomes

-- First, enhance the opening_segments table with rejection tracking
ALTER TABLE opening_segments
ADD COLUMN IF NOT EXISTS rejection_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS rejection_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS rejection_timestamp_ms INTEGER,
ADD COLUMN IF NOT EXISTS rebuttal_attempted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS rebuttal_quality_score INTEGER CHECK (rebuttal_quality_score >= 0 AND rebuttal_quality_score <= 100),
ADD COLUMN IF NOT EXISTS led_to_pitch BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS rebuttal_to_outcome VARCHAR(50),
ADD COLUMN IF NOT EXISTS time_to_rebuttal_ms INTEGER,
ADD COLUMN IF NOT EXISTS agent_stayed_professional BOOLEAN DEFAULT true;

-- Create detailed rejection analysis table for all calls (including short ones)
CREATE TABLE IF NOT EXISTS rejection_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,

  -- Call categorization
  call_duration_sec INTEGER NOT NULL,
  call_tier VARCHAR(30) NOT NULL, -- 'immediate_rejection', 'short_rejection', 'pitched_after_rejection', 'full_conversation'
  call_category VARCHAR(30), -- 'rejection_handled', 'rejection_failed', 'normal'

  -- Opening delivery tracking
  opening_delivered VARCHAR(20), -- 'complete', 'partial', 'none'
  opening_score INTEGER CHECK (opening_score >= 0 AND opening_score <= 100),
  greeting_completed BOOLEAN DEFAULT false,
  purpose_stated BOOLEAN DEFAULT false,
  permission_asked BOOLEAN DEFAULT false,

  -- Rejection details
  rejection_detected BOOLEAN DEFAULT false,
  rejection_type VARCHAR(50), -- 'not_interested', 'no_time', 'already_have', 'spam_fear', 'hostile', 'spouse_decision'
  rejection_timestamp_ms INTEGER,
  rejection_severity VARCHAR(20), -- 'mild', 'moderate', 'severe', 'hostile'
  customer_exact_rejection TEXT,

  -- Rebuttal tracking
  rebuttal_attempted BOOLEAN DEFAULT false,
  rebuttal_timestamp_ms INTEGER,
  time_to_rebuttal_ms INTEGER, -- How quickly agent responded
  rebuttal_type VARCHAR(50), -- 'value_prop', 'empathy', 'question', 'permission', 'humor'
  rebuttal_quality_score INTEGER CHECK (rebuttal_quality_score >= 0 AND rebuttal_quality_score <= 100),
  agent_exact_response TEXT,

  -- Professionalism & Compliance
  professionalism_score INTEGER CHECK (professionalism_score >= 0 AND professionalism_score <= 100),
  stayed_professional BOOLEAN DEFAULT true,
  script_compliance_score INTEGER CHECK (script_compliance_score >= 0 AND script_compliance_score <= 100),
  compliance_violations TEXT[],

  -- Outcomes & Causality
  led_to_pitch BOOLEAN DEFAULT false,
  pitch_timestamp_ms INTEGER,
  product_discussed BOOLEAN DEFAULT false,
  rebuttal_to_outcome VARCHAR(50), -- 'immediate_hangup', 'continued_listening', 'asked_questions', 'pitched', 'sale', 'appointment'
  final_disposition VARCHAR(50),

  -- ROI Metrics
  time_invested_after_rebuttal_sec INTEGER,
  value_recovered DECIMAL, -- Premium value if sale after rejection
  roi_score DECIMAL, -- Calculated ROI of persistence

  -- Coaching & Improvements
  coaching_notes TEXT,
  missed_opportunities TEXT[],
  recommended_rebuttal TEXT,
  success_probability DECIMAL, -- ML-predicted probability of success

  -- Metadata
  agent_id UUID REFERENCES agents(id),
  agent_name VARCHAR(255),
  campaign VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(call_id)
);

-- Create agent rejection performance tracking
CREATE TABLE IF NOT EXISTS agent_rejection_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  agent_name VARCHAR(255) NOT NULL,

  -- Performance period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Rejection metrics
  total_rejections INTEGER DEFAULT 0,
  rejections_immediate INTEGER DEFAULT 0, -- 3-15 seconds
  rejections_short INTEGER DEFAULT 0, -- 15-30 seconds
  rejections_after_pitch INTEGER DEFAULT 0, -- 30+ seconds

  -- Rebuttal performance
  rebuttals_attempted INTEGER DEFAULT 0,
  rebuttal_attempt_rate DECIMAL,
  successful_rebuttals INTEGER DEFAULT 0, -- Led to continued conversation
  rebuttal_success_rate DECIMAL,

  -- Outcome tracking
  pitched_after_rejection INTEGER DEFAULT 0,
  pitch_achievement_rate DECIMAL,
  sales_after_rejection INTEGER DEFAULT 0,
  rejection_to_sale_rate DECIMAL,
  appointments_after_rejection INTEGER DEFAULT 0,

  -- Quality metrics
  avg_professionalism_score DECIMAL,
  avg_rebuttal_quality_score DECIMAL,
  avg_script_compliance_score DECIMAL,
  lost_composure_count INTEGER DEFAULT 0,

  -- Improvement tracking
  common_rejection_types JSONB, -- {type: count} mapping
  successful_rebuttal_patterns TEXT[],
  coaching_priority_score DECIMAL, -- Higher = needs more coaching

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(agent_id, period_start, period_end)
);

-- Create rebuttal patterns library (learned from successful calls)
CREATE TABLE IF NOT EXISTS rebuttal_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pattern identification
  pattern_name VARCHAR(100) NOT NULL,
  rejection_type VARCHAR(50) NOT NULL,
  rebuttal_text TEXT NOT NULL,

  -- Performance metrics from real data
  times_used INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  success_rate DECIMAL,
  avg_call_duration_after DECIMAL, -- Average seconds after rebuttal

  -- Outcome distribution
  led_to_pitch_count INTEGER DEFAULT 0,
  led_to_sale_count INTEGER DEFAULT 0,
  led_to_appointment_count INTEGER DEFAULT 0,
  immediate_hangup_count INTEGER DEFAULT 0,

  -- Quality metrics
  avg_quality_score DECIMAL,
  agent_adoption_rate DECIMAL, -- % of agents using this pattern

  -- Discovery metadata
  discovered_from_agent VARCHAR(255),
  discovered_from_call_id UUID,
  discovery_date TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'testing', 'retired'
  recommended_for_training BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rejection_analysis_call ON rejection_analysis(call_id);
CREATE INDEX IF NOT EXISTS idx_rejection_analysis_agent ON rejection_analysis(agent_id);
CREATE INDEX IF NOT EXISTS idx_rejection_analysis_tier ON rejection_analysis(call_tier);
CREATE INDEX IF NOT EXISTS idx_rejection_analysis_created ON rejection_analysis(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rejection_analysis_rebuttal ON rejection_analysis(rebuttal_attempted, led_to_pitch);

CREATE INDEX IF NOT EXISTS idx_agent_rejection_perf_agent ON agent_rejection_performance(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_rejection_perf_period ON agent_rejection_performance(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_agent_rejection_perf_coaching ON agent_rejection_performance(coaching_priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_rebuttal_patterns_type ON rebuttal_patterns(rejection_type);
CREATE INDEX IF NOT EXISTS idx_rebuttal_patterns_success ON rebuttal_patterns(success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_rebuttal_patterns_status ON rebuttal_patterns(status);

CREATE INDEX IF NOT EXISTS idx_opening_segments_rejection ON opening_segments(rejection_detected, rebuttal_attempted);

-- Create update timestamp triggers
CREATE OR REPLACE FUNCTION update_rejection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rejection_analysis_timestamp
  BEFORE UPDATE ON rejection_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_rejection_timestamp();

CREATE TRIGGER update_agent_rejection_performance_timestamp
  BEFORE UPDATE ON agent_rejection_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_rejection_timestamp();

CREATE TRIGGER update_rebuttal_patterns_timestamp
  BEFORE UPDATE ON rebuttal_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_rejection_timestamp();

-- Grant permissions
GRANT ALL ON rejection_analysis TO authenticated;
GRANT ALL ON agent_rejection_performance TO authenticated;
GRANT ALL ON rebuttal_patterns TO authenticated;

-- Helper view for rejection metrics dashboard
CREATE OR REPLACE VIEW rejection_metrics_summary AS
SELECT
  DATE(ra.created_at) as date,
  COUNT(*) as total_rejections,
  COUNT(*) FILTER (WHERE ra.rebuttal_attempted = true) as rebuttals_attempted,
  COUNT(*) FILTER (WHERE ra.led_to_pitch = true) as led_to_pitch,
  COUNT(*) FILTER (WHERE ra.rebuttal_to_outcome IN ('sale', 'appointment')) as positive_outcomes,
  ROUND(AVG(ra.professionalism_score), 1) as avg_professionalism,
  ROUND(AVG(ra.rebuttal_quality_score), 1) as avg_rebuttal_quality,
  ROUND(
    COUNT(*) FILTER (WHERE ra.rebuttal_attempted = true)::DECIMAL /
    NULLIF(COUNT(*), 0) * 100, 1
  ) as rebuttal_attempt_rate,
  ROUND(
    COUNT(*) FILTER (WHERE ra.led_to_pitch = true)::DECIMAL /
    NULLIF(COUNT(*) FILTER (WHERE ra.rebuttal_attempted = true), 0) * 100, 1
  ) as pitch_achievement_rate,
  ROUND(
    COUNT(*) FILTER (WHERE ra.rebuttal_to_outcome = 'sale')::DECIMAL /
    NULLIF(COUNT(*), 0) * 100, 1
  ) as rejection_to_sale_rate
FROM rejection_analysis ra
WHERE ra.rejection_detected = true
GROUP BY DATE(ra.created_at)
ORDER BY date DESC;

GRANT SELECT ON rejection_metrics_summary TO authenticated;

-- Comments for documentation
COMMENT ON TABLE rejection_analysis IS 'Comprehensive analysis of rejection handling including short calls';
COMMENT ON TABLE agent_rejection_performance IS 'Agent-level rejection handling performance metrics';
COMMENT ON TABLE rebuttal_patterns IS 'Library of successful rebuttal patterns discovered from real calls';
COMMENT ON VIEW rejection_metrics_summary IS 'Daily summary of rejection handling metrics';