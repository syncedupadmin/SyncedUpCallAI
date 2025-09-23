-- Fix missing columns that are causing errors

-- 1. Fix transcript_embeddings table - add created_at if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transcript_embeddings'
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE transcript_embeddings
    ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- 2. Fix calls table - add source column if missing with default value
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls'
    AND column_name = 'source'
  ) THEN
    ALTER TABLE calls
    ADD COLUMN source VARCHAR(50) DEFAULT 'convoso';

    -- Update existing records
    UPDATE calls SET source = 'convoso' WHERE source IS NULL;

    -- Now make it NOT NULL
    ALTER TABLE calls ALTER COLUMN source SET NOT NULL;
  END IF;
END $$;

-- 3. Add source_ref column if missing (for lead_id reference)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls'
    AND column_name = 'source_ref'
  ) THEN
    ALTER TABLE calls
    ADD COLUMN source_ref VARCHAR(255);

    -- Create index for faster lookups
    CREATE INDEX idx_calls_source_ref ON calls(source_ref);
  END IF;
END $$;

-- 4. Ensure analyzed_at has a default value
DO $$
BEGIN
  -- Check if analyzed_at exists and update its default
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calls'
    AND column_name = 'analyzed_at'
  ) THEN
    ALTER TABLE calls ALTER COLUMN analyzed_at SET DEFAULT NOW();
  END IF;
END $$;

-- 5. Add missing indices for performance
CREATE INDEX IF NOT EXISTS idx_calls_recording_url ON calls(recording_url);
CREATE INDEX IF NOT EXISTS idx_calls_source ON calls(source);
CREATE INDEX IF NOT EXISTS idx_calls_call_id ON calls(call_id);

-- Log the migration
INSERT INTO migration_log (name, executed_at, success)
VALUES ('fix-missing-columns', NOW(), true)
ON CONFLICT DO NOTHING;