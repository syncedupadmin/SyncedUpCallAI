-- COMPLETE FIX FOR CREATING AGENCIES WITH PRODUCT_TYPE
-- Run this ENTIRE migration to fix agency creation with product_type

-- ============================================
-- 1. ENSURE PRODUCT_TYPE COLUMN EXISTS
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'agencies'
    AND column_name = 'product_type'
  ) THEN
    ALTER TABLE public.agencies
    ADD COLUMN product_type text DEFAULT 'full' CHECK (product_type IN ('full', 'compliance_only'));
  END IF;
END$$;

-- Set default for existing records
UPDATE public.agencies
SET product_type = 'full'
WHERE product_type IS NULL;

-- ============================================
-- 2. DROP OLD VERSIONS OF THE FUNCTION
-- ============================================
DROP FUNCTION IF EXISTS public.create_agency_with_owner(text) CASCADE;
DROP FUNCTION IF EXISTS public.create_agency_with_owner(text, text) CASCADE;

-- ============================================
-- 3. CREATE UPDATED FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.create_agency_with_owner(
  p_name text,
  p_product_type text DEFAULT 'full'
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  owner_user_id uuid,
  product_type text,
  created_at timestamptz,
  updated_at timestamptz,
  discovery_status text,
  discovery_session_id text,
  convoso_credentials jsonb,
  discovery_skip_reason text,
  settings jsonb,
  onboarding_step integer,
  last_discovery_at timestamptz,
  deleted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_slug text;
  v_user_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate and normalize product_type
  IF p_product_type IS NULL OR p_product_type = '' THEN
    p_product_type := 'full';
  END IF;

  IF p_product_type NOT IN ('full', 'compliance_only') THEN
    RAISE EXCEPTION 'Invalid product_type: %. Must be "full" or "compliance_only"', p_product_type;
  END IF;

  -- Generate unique slug
  v_slug := public.next_unique_slug(public.slugify(p_name));

  -- Insert the agency
  INSERT INTO public.agencies(
    name,
    slug,
    owner_user_id,
    product_type,
    created_at,
    updated_at
  )
  VALUES (
    p_name,
    v_slug,
    v_user_id,
    p_product_type,
    now(),
    now()
  )
  RETURNING agencies.id INTO v_agency_id;

  -- Add owner to user_agencies
  INSERT INTO public.user_agencies(user_id, agency_id, role, created_at, updated_at)
  VALUES (v_user_id, v_agency_id, 'owner', now(), now())
  ON CONFLICT (user_id, agency_id) DO NOTHING;

  -- Return the created agency
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.slug,
    a.owner_user_id,
    a.product_type,
    a.created_at,
    a.updated_at,
    a.discovery_status,
    a.discovery_session_id,
    a.convoso_credentials,
    a.discovery_skip_reason,
    a.settings,
    a.onboarding_step,
    a.last_discovery_at,
    a.deleted_at
  FROM public.agencies a
  WHERE a.id = v_agency_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in create_agency_with_owner: %', SQLERRM;
    RAISE;
END;
$$;

-- ============================================
-- 4. GRANT PERMISSIONS
-- ============================================
REVOKE ALL ON FUNCTION public.create_agency_with_owner(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_agency_with_owner(text, text) TO authenticated, service_role;

-- ============================================
-- 5. ENSURE RLS POLICIES ALLOW INSERT
-- ============================================
-- Drop existing INSERT policies
DROP POLICY IF EXISTS "agencies_insert_authenticated" ON public.agencies;
DROP POLICY IF EXISTS "agencies_insert_superadmin" ON public.agencies;

-- Create new INSERT policy - users can create agencies they own
CREATE POLICY "agencies_insert_users_own"
ON public.agencies
FOR INSERT
TO authenticated
WITH CHECK (
  owner_user_id = auth.uid()
);

-- ============================================
-- 6. TEST QUERIES (Run these manually to verify)
-- ============================================
-- Check if function exists:
-- SELECT proname, proargtypes FROM pg_proc WHERE proname = 'create_agency_with_owner';

-- Test creating an agency:
-- SELECT * FROM public.create_agency_with_owner('Test Compliance Agency', 'compliance_only');

-- Verify the agency was created with correct product_type:
-- SELECT id, name, product_type FROM public.agencies ORDER BY created_at DESC LIMIT 1;

-- ============================================
-- 7. SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Agency creation with product_type is now fixed! Test by creating a new agency.';
END$$;