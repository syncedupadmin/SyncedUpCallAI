-- Complete setup for agency product_type management
-- This migration enables product type editing in the super admin portal

-- 1. First ensure the agencies table has RLS enabled
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

-- 2. Create RLS policies for agencies table if they don't exist
-- Allow authenticated users to view agencies they belong to
DROP POLICY IF EXISTS "Users can view their agencies" ON public.agencies;
CREATE POLICY "Users can view their agencies" ON public.agencies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_agencies
      WHERE user_agencies.agency_id = agencies.id
      AND user_agencies.user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

-- Allow super admins to update any agency
DROP POLICY IF EXISTS "Super admins can update agencies" ON public.agencies;
CREATE POLICY "Super admins can update agencies" ON public.agencies
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Allow agency owners to update their own agencies
DROP POLICY IF EXISTS "Agency owners can update their agencies" ON public.agencies;
CREATE POLICY "Agency owners can update their agencies" ON public.agencies
  FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Allow super admins to insert new agencies
DROP POLICY IF EXISTS "Super admins can insert agencies" ON public.agencies;
CREATE POLICY "Super admins can insert agencies" ON public.agencies
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());

-- Allow super admins to delete agencies
DROP POLICY IF EXISTS "Super admins can delete agencies" ON public.agencies;
CREATE POLICY "Super admins can delete agencies" ON public.agencies
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

-- 3. Create or replace the RPC function for updating product type
CREATE OR REPLACE FUNCTION public.update_agency_product_type(
  p_agency_id uuid,
  p_product_type text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super_admin boolean;
  v_agency_name text;
  v_old_product_type text;
BEGIN
  -- Check if user is super admin
  v_is_super_admin := public.is_super_admin();

  IF NOT v_is_super_admin THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only super admins can update product type'
    );
  END IF;

  -- Validate product_type
  IF p_product_type NOT IN ('full', 'compliance_only') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid product_type. Must be "full" or "compliance_only"'
    );
  END IF;

  -- Check if agency exists and get current data
  SELECT name, product_type INTO v_agency_name, v_old_product_type
  FROM public.agencies
  WHERE id = p_agency_id;

  IF v_agency_name IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Agency not found'
    );
  END IF;

  -- Check if product type is actually changing
  IF v_old_product_type = p_product_type THEN
    RETURN json_build_object(
      'success', true,
      'agency_name', v_agency_name,
      'new_product_type', p_product_type,
      'message', 'Product type unchanged'
    );
  END IF;

  -- Update the agency product type
  UPDATE public.agencies
  SET
    product_type = p_product_type,
    updated_at = now()
  WHERE id = p_agency_id;

  -- Log the change (optional - for audit trail)
  RAISE LOG 'Product type updated for agency % (%) from % to % by user %',
    v_agency_name, p_agency_id, v_old_product_type, p_product_type, auth.uid();

  RETURN json_build_object(
    'success', true,
    'agency_name', v_agency_name,
    'old_product_type', v_old_product_type,
    'new_product_type', p_product_type,
    'message', 'Product type updated successfully'
  );
END;
$$;

-- Grant execute permission to authenticated users (will be checked within function)
GRANT EXECUTE ON FUNCTION public.update_agency_product_type(uuid, text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.update_agency_product_type IS
  'Updates the product type for an agency. Only super admins can use this function. Returns success status with details.';

-- 4. Ensure service role can bypass RLS for admin operations
GRANT ALL ON public.agencies TO service_role;

-- 5. Create an audit log entry (optional)
INSERT INTO public.system_logs (action, details, created_at)
VALUES (
  'migration_applied',
  json_build_object(
    'migration', '20250203_complete_product_type_setup',
    'description', 'Added RLS policies and RPC function for agency product_type management'
  ),
  now()
) ON CONFLICT DO NOTHING;

-- 6. Verify the setup
DO $$
BEGIN
  -- Check if RLS is enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'agencies'
    AND rowsecurity = true
  ) THEN
    RAISE WARNING 'RLS is not enabled on agencies table';
  END IF;

  -- Check if function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'update_agency_product_type'
  ) THEN
    RAISE WARNING 'Function update_agency_product_type was not created';
  END IF;

  RAISE NOTICE 'Migration completed successfully';
END $$;