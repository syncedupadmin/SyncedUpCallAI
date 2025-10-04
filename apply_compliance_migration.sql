-- Apply compliance fields to agencies table
-- Run this script in your Supabase SQL Editor

-- Add Convoso credential columns for compliance integration
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS convoso_auth_token TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS convoso_base_url TEXT DEFAULT 'https://api.convoso.com/v1';
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS compliance_settings JSONB DEFAULT '{"strict_mode_threshold": 98, "fuzzy_mode_threshold": 80, "auto_analyze_new_calls": true, "email_notifications": false, "notification_email": ""}';

-- Add indexes for credential lookups
CREATE INDEX IF NOT EXISTS idx_agencies_convoso_auth_token ON agencies(convoso_auth_token) WHERE convoso_auth_token IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN agencies.convoso_auth_token IS 'Encrypted Convoso auth token for API access (AES-256-CBC)';
COMMENT ON COLUMN agencies.convoso_base_url IS 'Convoso API base URL (default: https://api.convoso.com/v1)';
COMMENT ON COLUMN agencies.compliance_settings IS 'Compliance threshold and notification settings (strict_mode_threshold, fuzzy_mode_threshold, auto_analyze_new_calls, email_notifications, notification_email)';

-- Verify the columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'agencies'
AND column_name IN ('convoso_auth_token', 'convoso_base_url', 'compliance_settings');