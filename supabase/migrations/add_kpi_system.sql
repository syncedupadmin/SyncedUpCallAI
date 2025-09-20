-- Migration for KPI baseline and tracking system

-- Store KPI baselines per agency (first N calls)
CREATE TABLE IF NOT EXISTS kpi_baselines (
  agency_id TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 10000,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agency_id, window_start, window_end)
);

-- Daily KPI rollups per agency
CREATE TABLE IF NOT EXISTS kpi_daily_agency (
  agency_id TEXT NOT NULL,
  day DATE NOT NULL,
  n_calls INTEGER DEFAULT 0,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agency_id, day)
);

-- Daily KPI rollups per agent
CREATE TABLE IF NOT EXISTS kpi_daily_agent (
  agency_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  day DATE NOT NULL,
  n_calls INTEGER DEFAULT 0,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agency_id, agent_id, day)
);

-- Weekly KPI rollups per agency
CREATE TABLE IF NOT EXISTS kpi_weekly_agency (
  agency_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  n_calls INTEGER DEFAULT 0,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agency_id, week_start)
);

-- Weekly KPI rollups per agent
CREATE TABLE IF NOT EXISTS kpi_weekly_agent (
  agency_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  n_calls INTEGER DEFAULT 0,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (agency_id, agent_id, week_start)
);

-- Add columns to calls table if missing
ALTER TABLE calls ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS analyzed_day DATE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agency_id TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS analysis_json JSONB;

-- Create trigger to automatically set analyzed_day from analyzed_at
CREATE OR REPLACE FUNCTION set_analyzed_day()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.analyzed_at IS NOT NULL THEN
    NEW.analyzed_day = DATE(NEW.analyzed_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_analyzed_day_trigger ON calls;
CREATE TRIGGER set_analyzed_day_trigger
BEFORE INSERT OR UPDATE ON calls
FOR EACH ROW
EXECUTE FUNCTION set_analyzed_day();

-- Indexes for efficient KPI computation
CREATE INDEX IF NOT EXISTS idx_calls_agency_analyzed ON calls(agency_id, analyzed_at);
CREATE INDEX IF NOT EXISTS idx_calls_agent_analyzed ON calls(agent_id, analyzed_at);
CREATE INDEX IF NOT EXISTS idx_kpi_daily_agency_day ON kpi_daily_agency(day DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_daily_agent_day ON kpi_daily_agent(day DESC);

-- RPC function for efficient baseline fetching
CREATE OR REPLACE FUNCTION fetch_calls_for_baseline(
  p_agency_id TEXT,
  p_n INTEGER DEFAULT 10000
)
RETURNS TABLE (
  id TEXT,
  agent_id TEXT,
  agency_id TEXT,
  analyzed_at TIMESTAMPTZ,
  outcome JSONB,
  signals JSONB,
  facts JSONB,
  rebuttals JSONB,
  rebuttals_opening JSONB,
  rebuttals_closing JSONB,
  talk_metrics JSONB,
  wasted_call BOOLEAN,
  price_change BOOLEAN,
  discount_cents_total INTEGER,
  questions_first_minute INTEGER,
  hold JSONB,
  callback_set BOOLEAN,
  call_type VARCHAR(20)
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    id,
    agent_id,
    agency_id,
    analyzed_at,
    analysis_json->'outcome' as outcome,
    analysis_json->'signals' as signals,
    analysis_json->'facts' as facts,
    analysis_json->'rebuttals' as rebuttals,
    analysis_json->'rebuttals_opening' as rebuttals_opening,
    analysis_json->'rebuttals_closing' as rebuttals_closing,
    analysis_json->'talk_metrics' as talk_metrics,
    (analysis_json->>'wasted_call')::boolean as wasted_call,
    (analysis_json->>'price_change')::boolean as price_change,
    (analysis_json->>'discount_cents_total')::integer as discount_cents_total,
    (analysis_json->>'questions_first_minute')::integer as questions_first_minute,
    analysis_json->'hold' as hold,
    COALESCE((analysis_json->>'callback_set')::boolean, (analysis_json->'signals'->>'callback_set')::boolean) as callback_set,
    COALESCE(analysis_json->>'call_type', analysis_json->'signals'->>'call_type', 'unknown')::varchar(20) as call_type
  FROM calls
  WHERE
    agency_id = p_agency_id
    AND analyzed_at IS NOT NULL
    AND analysis_json IS NOT NULL
  ORDER BY analyzed_at ASC
  LIMIT p_n;
$$;

-- Grant permissions if needed
GRANT ALL ON kpi_baselines TO authenticated;
GRANT ALL ON kpi_daily_agency TO authenticated;
GRANT ALL ON kpi_daily_agent TO authenticated;
GRANT EXECUTE ON FUNCTION fetch_calls_for_baseline TO authenticated;

-- Comments for documentation
COMMENT ON TABLE kpi_baselines IS 'Stores baseline KPI metrics for agencies based on their first N calls';
COMMENT ON TABLE kpi_daily_agency IS 'Daily KPI rollups per agency';
COMMENT ON TABLE kpi_daily_agent IS 'Daily KPI rollups per agent within an agency';
COMMENT ON FUNCTION fetch_calls_for_baseline IS 'Fetches first N analyzed calls for an agency to compute baseline KPIs';