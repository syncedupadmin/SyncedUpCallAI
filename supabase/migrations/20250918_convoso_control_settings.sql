-- Create Convoso Control Settings Table
CREATE TABLE IF NOT EXISTS convoso_control_settings (
  id SERIAL PRIMARY KEY,
  system_enabled BOOLEAN DEFAULT false,
  active_campaigns JSONB DEFAULT '[]'::jsonb,
  active_lists JSONB DEFAULT '[]'::jsonb,
  active_dispositions JSONB DEFAULT '[]'::jsonb,
  active_agents JSONB DEFAULT '[]'::jsonb,
  filter_mode VARCHAR(20) DEFAULT 'include', -- 'include' or 'exclude'
  last_sync TIMESTAMP WITH TIME ZONE,
  next_sync TIMESTAMP WITH TIME ZONE,
  sync_interval_minutes INT DEFAULT 15,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO convoso_control_settings (
  system_enabled,
  active_campaigns,
  active_lists,
  active_dispositions,
  active_agents
) VALUES (
  false, -- System starts OFF
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb
) ON CONFLICT DO NOTHING;

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION update_convoso_control_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER convoso_control_updated_at
  BEFORE UPDATE ON convoso_control_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_convoso_control_updated_at();

-- Grant permissions
GRANT ALL ON convoso_control_settings TO authenticated;
GRANT ALL ON convoso_control_settings_id_seq TO authenticated;