-- Agency settings for alerts and configuration
CREATE TABLE IF NOT EXISTS agency_settings (
  id SERIAL PRIMARY KEY,
  agency_name text,
  alerts_enabled boolean DEFAULT true,
  slack_webhook_url text,
  slack_channel text,
  email_alerts_enabled boolean DEFAULT false,
  email_recipients text[], -- Array of email addresses
  high_risk_threshold_qa_score int DEFAULT 55,
  high_risk_duration_seconds int DEFAULT 600,
  daily_summary_enabled boolean DEFAULT true,
  daily_summary_time time DEFAULT '09:00:00',
  timezone text DEFAULT 'America/New_York',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Alert logs for tracking sent alerts
CREATE TABLE IF NOT EXISTS alert_logs (
  id SERIAL PRIMARY KEY,
  type text NOT NULL, -- 'slack', 'email', 'webhook'
  status text NOT NULL, -- 'success', 'failed'
  payload jsonb,
  error text,
  retry_count int DEFAULT 0,
  created_at timestamp DEFAULT now()
);

-- Index for alert logs
CREATE INDEX IF NOT EXISTS idx_alert_logs_created_at ON alert_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_logs_type_status ON alert_logs(type, status);

-- Insert default settings if not exists
INSERT INTO agency_settings (
  agency_name,
  alerts_enabled,
  high_risk_threshold_qa_score,
  high_risk_duration_seconds
) 
SELECT 
  'Default Agency',
  true,
  55,
  600
WHERE NOT EXISTS (SELECT 1 FROM agency_settings LIMIT 1);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_agency_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agency_settings_updated_at ON agency_settings;

CREATE TRIGGER agency_settings_updated_at
BEFORE UPDATE ON agency_settings
FOR EACH ROW
EXECUTE FUNCTION update_agency_settings_updated_at();