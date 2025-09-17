-- Create sync_state table for tracking Convoso sync progress
CREATE TABLE IF NOT EXISTS sync_state (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT,
  office_id BIGINT DEFAULT 1,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for office_id lookups
CREATE INDEX IF NOT EXISTS idx_sync_state_office_id ON sync_state(office_id);

-- Initialize for Default Office (id=1)
INSERT INTO sync_state (key, value, office_id)
VALUES ('last_convoso_check', NOW()::TEXT, 1)
ON CONFLICT (key) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE sync_state IS 'Tracks synchronization state for external systems like Convoso API polling';
COMMENT ON COLUMN sync_state.key IS 'Unique key identifier for the sync state (e.g., last_convoso_check)';
COMMENT ON COLUMN sync_state.value IS 'State value, typically a timestamp or configuration';
COMMENT ON COLUMN sync_state.office_id IS 'Office ID for multi-tenant support';