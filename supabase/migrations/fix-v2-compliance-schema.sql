-- Fix V2 Compliance System Schema Issues
-- Adds missing agent_id column to post_close_compliance

-- 1. Add agent_id column to post_close_compliance (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_close_compliance'
    AND column_name = 'agent_id'
  ) THEN
    ALTER TABLE post_close_compliance
    ADD COLUMN agent_id UUID REFERENCES auth.users(id);

    -- Add index for performance
    CREATE INDEX IF NOT EXISTS idx_post_close_compliance_agent_id
    ON post_close_compliance(agent_id);
  END IF;
END $$;

-- 2. Make segment_id nullable (already is, but ensure it)
-- No action needed - segment_id is already nullable

-- 3. Add comment for clarity
COMMENT ON COLUMN post_close_compliance.agent_id IS 'Reference to auth.users for agent identity (V2 system)';
COMMENT ON COLUMN post_close_compliance.segment_id IS 'Reference to post_close_segments - NULL for V2 inline compliance checks';
