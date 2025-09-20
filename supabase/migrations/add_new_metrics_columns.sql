-- Migration to add new metrics columns for enhanced call analysis
-- Run this after updating the analyze route

-- Add hold detection columns
ALTER TABLE calls ADD COLUMN IF NOT EXISTS hold_time_sec INTEGER;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS hold_events INTEGER;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS hold_reasons JSONB;

-- Add questions tracking
ALTER TABLE calls ADD COLUMN IF NOT EXISTS questions_first_minute INTEGER;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS talk_ratio_agent DECIMAL(3,2);

-- Add price change tracking
ALTER TABLE calls ADD COLUMN IF NOT EXISTS price_change BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS discount_cents_total INTEGER;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS price_timeline JSONB;

-- Add wasted call detection
ALTER TABLE calls ADD COLUMN IF NOT EXISTS wasted_call BOOLEAN DEFAULT FALSE;

-- Add callback and call type signals
ALTER TABLE calls ADD COLUMN IF NOT EXISTS callback_set BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type VARCHAR(20) CHECK (call_type IN ('outbound', 'inbound', 'transfer', 'unknown'));

-- Add opening/money rebuttal breakdown
ALTER TABLE calls ADD COLUMN IF NOT EXISTS rebuttals_opening JSONB;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS rebuttals_money JSONB;

-- Add contact name detection
ALTER TABLE calls ADD COLUMN IF NOT EXISTS contact_guess JSONB;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_calls_wasted ON calls(wasted_call) WHERE wasted_call = TRUE;
CREATE INDEX IF NOT EXISTS idx_calls_price_change ON calls(price_change) WHERE price_change = TRUE;
CREATE INDEX IF NOT EXISTS idx_calls_callback ON calls(callback_set) WHERE callback_set = TRUE;
CREATE INDEX IF NOT EXISTS idx_calls_call_type ON calls(call_type);
CREATE INDEX IF NOT EXISTS idx_calls_hold_events ON calls(hold_events) WHERE hold_events > 0;

-- Add comment for documentation
COMMENT ON COLUMN calls.hold_time_sec IS 'Total seconds spent on hold during the call';
COMMENT ON COLUMN calls.hold_events IS 'Number of hold events detected (agent hold or long silence)';
COMMENT ON COLUMN calls.hold_reasons IS 'JSON array of hold event details with startMs, endMs, and reason';
COMMENT ON COLUMN calls.questions_first_minute IS 'Number of discovery questions asked by agent in first 60 seconds';
COMMENT ON COLUMN calls.talk_ratio_agent IS 'Ratio of agent talk time to total talk time (0-1)';
COMMENT ON COLUMN calls.price_change IS 'Whether price changed during the call';
COMMENT ON COLUMN calls.discount_cents_total IS 'Total discount amount mentioned in cents';
COMMENT ON COLUMN calls.price_timeline IS 'JSON array of price events throughout the call';
COMMENT ON COLUMN calls.wasted_call IS 'Call where customer answered but agent provided minimal content';
COMMENT ON COLUMN calls.callback_set IS 'Whether a callback was scheduled during the call';
COMMENT ON COLUMN calls.call_type IS 'Type of call: outbound, inbound, transfer, or unknown';
COMMENT ON COLUMN calls.rebuttals_opening IS 'Opening phase rebuttals (first 30s) with used/missed breakdown';
COMMENT ON COLUMN calls.rebuttals_money IS 'Money/close phase rebuttals with used/missed breakdown';
COMMENT ON COLUMN calls.contact_guess IS 'Customer name detection with source and confidence';