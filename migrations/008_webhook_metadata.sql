-- Add metadata and updated_at columns for webhook data storage
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS metadata jsonb,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

-- Add index for updated_at
CREATE INDEX IF NOT EXISTS idx_calls_updated ON calls (updated_at DESC);