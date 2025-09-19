-- Create batch_progress table to track batch processing status
CREATE TABLE IF NOT EXISTS batch_progress (
  batch_id VARCHAR(50) PRIMARY KEY,
  total INTEGER NOT NULL DEFAULT 0,
  scanned INTEGER NOT NULL DEFAULT 0,
  posted INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'processing',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_batch_progress_created_at ON batch_progress(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_batch_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_batch_progress_updated_at
BEFORE UPDATE ON batch_progress
FOR EACH ROW
EXECUTE FUNCTION update_batch_progress_updated_at();

-- Clean up old batch progress (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_batch_progress()
RETURNS void AS $$
BEGIN
  DELETE FROM batch_progress WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;