-- Migration: Create webhook_tokens table for multi-tenant webhook authentication
-- Date: 2025-09-27
-- Purpose: Enable agency-scoped webhook tokens to prevent data orphaning

-- ============================================================================
-- STEP 1: Create webhook_tokens table
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Foreign keys
  CONSTRAINT webhook_tokens_agency_fkey
    FOREIGN KEY (agency_id)
    REFERENCES agencies(id)
    ON DELETE CASCADE,

  CONSTRAINT webhook_tokens_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL
);

-- ============================================================================
-- STEP 2: Create indexes for performance
-- ============================================================================

-- Index for agency lookups
CREATE INDEX idx_webhook_tokens_agency
  ON webhook_tokens(agency_id);

-- Index for token validation (most common query)
CREATE INDEX idx_webhook_tokens_token_active
  ON webhook_tokens(token)
  WHERE is_active = true;

-- Index for last_used_at sorting
CREATE INDEX idx_webhook_tokens_last_used
  ON webhook_tokens(last_used_at DESC NULLS LAST);

-- Index for active tokens per agency
CREATE INDEX idx_webhook_tokens_agency_active
  ON webhook_tokens(agency_id, is_active);

-- ============================================================================
-- STEP 3: Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE webhook_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view tokens for their agencies
CREATE POLICY "Users can view webhook tokens for their agencies"
  ON webhook_tokens
  FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id
      FROM agency_members
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Only owners/admins can create tokens
CREATE POLICY "Agency owners and admins can create webhook tokens"
  ON webhook_tokens
  FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id
      FROM agency_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: Only owners/admins can update tokens
CREATE POLICY "Agency owners and admins can update webhook tokens"
  ON webhook_tokens
  FOR UPDATE
  USING (
    agency_id IN (
      SELECT agency_id
      FROM agency_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Policy: Only owners/admins can delete tokens
CREATE POLICY "Agency owners and admins can delete webhook tokens"
  ON webhook_tokens
  FOR DELETE
  USING (
    agency_id IN (
      SELECT agency_id
      FROM agency_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- STEP 4: Create helper function for token validation
-- ============================================================================

CREATE OR REPLACE FUNCTION get_agency_from_webhook_token(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agency_id UUID;
BEGIN
  -- Validate token format
  IF p_token IS NULL OR NOT p_token LIKE 'agt_%' THEN
    RETURN NULL;
  END IF;

  -- Look up active token
  SELECT agency_id INTO v_agency_id
  FROM webhook_tokens
  WHERE token = p_token
    AND is_active = true;

  -- Update usage stats if token found
  IF v_agency_id IS NOT NULL THEN
    UPDATE webhook_tokens
    SET
      last_used_at = NOW(),
      usage_count = usage_count + 1
    WHERE token = p_token;
  END IF;

  RETURN v_agency_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_agency_from_webhook_token(TEXT) TO authenticated;

-- Grant execute permission to service role (for webhook handlers)
GRANT EXECUTE ON FUNCTION get_agency_from_webhook_token(TEXT) TO service_role;

-- ============================================================================
-- STEP 5: Seed default tokens for existing agencies (optional)
-- ============================================================================

-- Generate a default token for each existing agency
-- Format: agt_<agency_name_slug>_<8_random_hex>
-- This is for backward compatibility during migration

INSERT INTO webhook_tokens (agency_id, token, name, description, is_active)
SELECT
  id as agency_id,
  CONCAT(
    'agt_',
    LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g')),
    '_',
    SUBSTR(MD5(RANDOM()::text), 1, 8)
  ) as token,
  'Default Webhook Token' as name,
  'Auto-generated token for migration. Please rotate after testing.' as description,
  true as is_active
FROM agencies
WHERE NOT EXISTS (
  SELECT 1 FROM webhook_tokens WHERE webhook_tokens.agency_id = agencies.id
);

-- ============================================================================
-- STEP 6: Create audit trigger for token operations
-- ============================================================================

-- Create audit log table for sensitive token operations
CREATE TABLE IF NOT EXISTS webhook_token_audit (
  id BIGSERIAL PRIMARY KEY,
  token_id UUID,
  agency_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'created', 'revoked', 'used'
  performed_by UUID,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_token_audit_token ON webhook_token_audit(token_id);
CREATE INDEX idx_webhook_token_audit_agency ON webhook_token_audit(agency_id);
CREATE INDEX idx_webhook_token_audit_created ON webhook_token_audit(created_at DESC);

-- Trigger function for audit logging
CREATE OR REPLACE FUNCTION log_webhook_token_operation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO webhook_token_audit (
      token_id, agency_id, action, performed_by, metadata
    ) VALUES (
      NEW.id,
      NEW.agency_id,
      'created',
      NEW.created_by,
      jsonb_build_object('name', NEW.name)
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
    INSERT INTO webhook_token_audit (
      token_id, agency_id, action, performed_by, metadata
    ) VALUES (
      NEW.id,
      NEW.agency_id,
      'revoked',
      auth.uid(),
      jsonb_build_object('name', NEW.name)
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO webhook_token_audit (
      token_id, agency_id, action, performed_by, metadata
    ) VALUES (
      OLD.id,
      OLD.agency_id,
      'deleted',
      auth.uid(),
      jsonb_build_object('name', OLD.name)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER webhook_tokens_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON webhook_tokens
  FOR EACH ROW
  EXECUTE FUNCTION log_webhook_token_operation();

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- After migration, run these to verify:

-- 1. Check table exists and has correct structure
-- SELECT * FROM webhook_tokens LIMIT 1;

-- 2. Check indexes exist
-- SELECT indexname FROM pg_indexes WHERE tablename = 'webhook_tokens';

-- 3. Check RLS is enabled
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'webhook_tokens';

-- 4. Check policies exist
-- SELECT policyname FROM pg_policies WHERE tablename = 'webhook_tokens';

-- 5. Test token validation function
-- SELECT get_agency_from_webhook_token('agt_test');

-- 6. Check default tokens were created
-- SELECT agency_id, name, token, created_at FROM webhook_tokens ORDER BY created_at DESC;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================

-- If you need to rollback this migration:
--
-- DROP TRIGGER IF EXISTS webhook_tokens_audit_trigger ON webhook_tokens;
-- DROP FUNCTION IF EXISTS log_webhook_token_operation();
-- DROP TABLE IF EXISTS webhook_token_audit;
-- DROP FUNCTION IF EXISTS get_agency_from_webhook_token(TEXT);
-- DROP TABLE IF EXISTS webhook_tokens CASCADE;