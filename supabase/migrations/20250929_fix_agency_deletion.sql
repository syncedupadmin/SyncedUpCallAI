-- =====================================================
-- FIX AGENCY DELETION - Add Missing RLS Policies
-- =====================================================
-- This migration fixes the issue where agencies cannot be deleted
-- due to missing DELETE policies on the agencies table.
-- =====================================================

-- =====================================================
-- STEP 1: Add DELETE policy for super admins
-- =====================================================

-- Drop existing DELETE policy if it exists (unlikely but safe)
DROP POLICY IF EXISTS "Super admins can delete agencies" ON public.agencies;

-- Create DELETE policy for super admins
CREATE POLICY "Super admins can delete agencies"
ON public.agencies
FOR DELETE
TO authenticated
USING (
  public.is_super_admin()
);

-- =====================================================
-- STEP 2: Add UPDATE and INSERT policies for completeness
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can insert agencies" ON public.agencies;
DROP POLICY IF EXISTS "Super admins can update agencies" ON public.agencies;

-- Create INSERT policy for super admins
CREATE POLICY "Super admins can insert agencies"
ON public.agencies
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin()
);

-- Create UPDATE policy for super admins
CREATE POLICY "Super admins can update agencies"
ON public.agencies
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin()
)
WITH CHECK (
  public.is_super_admin()
);

-- =====================================================
-- STEP 3: Ensure SELECT policy exists
-- =====================================================

-- Drop and recreate SELECT policy to ensure consistency
DROP POLICY IF EXISTS "Super admins can view all agencies" ON public.agencies;
DROP POLICY IF EXISTS "Users can view their agencies" ON public.agencies;

-- Super admins can see all agencies
CREATE POLICY "Super admins can view all agencies"
ON public.agencies
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
);

-- Regular users can see agencies they belong to
CREATE POLICY "Users can view their agencies"
ON public.agencies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_agencies ua
    WHERE ua.user_id = auth.uid()
    AND ua.agency_id = agencies.id
  )
);

-- =====================================================
-- STEP 4: Fix user_agencies CASCADE DELETE
-- =====================================================

-- Add CASCADE DELETE to user_agencies table
-- This ensures user-agency relationships are cleaned up when an agency is deleted
DO $$
BEGIN
  -- Check if the constraint exists first
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'user_agencies_agency_id_fkey'
    AND table_name = 'user_agencies'
  ) THEN
    -- Drop the existing constraint
    ALTER TABLE public.user_agencies
    DROP CONSTRAINT user_agencies_agency_id_fkey;
  END IF;

  -- Add the constraint with CASCADE DELETE
  ALTER TABLE public.user_agencies
  ADD CONSTRAINT user_agencies_agency_id_fkey
  FOREIGN KEY (agency_id)
  REFERENCES public.agencies(id)
  ON DELETE CASCADE;
END $$;

-- =====================================================
-- STEP 5: Create audit log entry for agency deletions
-- =====================================================

-- Create a function to log agency deletions
CREATE OR REPLACE FUNCTION log_agency_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log the deletion to security_audit_log if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'security_audit_log'
  ) THEN
    INSERT INTO public.security_audit_log (
      user_id,
      action,
      table_name,
      record_id,
      details,
      ip_address,
      user_agent
    ) VALUES (
      auth.uid(),
      'DELETE',
      'agencies',
      OLD.id,
      jsonb_build_object(
        'agency_name', OLD.name,
        'agency_slug', OLD.slug,
        'deleted_by', auth.uid(),
        'deleted_at', now()
      ),
      current_setting('request.headers', true)::json->>'x-forwarded-for',
      current_setting('request.headers', true)::json->>'user-agent'
    );
  END IF;

  RETURN OLD;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS log_agency_deletion_trigger ON public.agencies;

-- Create trigger for logging agency deletions
CREATE TRIGGER log_agency_deletion_trigger
BEFORE DELETE ON public.agencies
FOR EACH ROW
EXECUTE FUNCTION log_agency_deletion();

-- =====================================================
-- STEP 6: Create RPC function for safe agency deletion
-- =====================================================

-- Create a secure RPC function for deleting agencies
CREATE OR REPLACE FUNCTION delete_agency_with_confirmation(
  p_agency_id UUID,
  p_confirm_name TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_name TEXT;
  v_member_count INT;
  v_call_count INT;
  v_webhook_count INT;
BEGIN
  -- Check if user is super admin
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only super admins can delete agencies'
    );
  END IF;

  -- Get agency details
  SELECT name INTO v_agency_name
  FROM public.agencies
  WHERE id = p_agency_id;

  IF v_agency_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Agency not found'
    );
  END IF;

  -- If confirmation name provided, verify it matches
  IF p_confirm_name IS NOT NULL AND p_confirm_name != v_agency_name THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Agency name confirmation does not match'
    );
  END IF;

  -- Get counts of related data
  SELECT COUNT(*) INTO v_member_count
  FROM public.user_agencies
  WHERE agency_id = p_agency_id;

  SELECT COUNT(*) INTO v_call_count
  FROM public.calls
  WHERE agency_id = p_agency_id;

  SELECT COUNT(*) INTO v_webhook_count
  FROM public.webhook_tokens
  WHERE agency_id = p_agency_id;

  -- Delete the agency (CASCADE will handle related records)
  DELETE FROM public.agencies WHERE id = p_agency_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', jsonb_build_object(
      'agency_name', v_agency_name,
      'members_removed', v_member_count,
      'calls_removed', v_call_count,
      'webhooks_removed', v_webhook_count
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users (RLS will handle actual auth)
GRANT EXECUTE ON FUNCTION delete_agency_with_confirmation TO authenticated;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- You can run these to verify the policies are in place:
-- SELECT * FROM pg_policies WHERE tablename = 'agencies';
-- SELECT * FROM information_schema.referential_constraints WHERE constraint_name LIKE '%agency%';