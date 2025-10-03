-- ============================================
-- TEST AND FIX PRODUCT_TYPE ISSUE
-- Run this in your Supabase SQL Editor
-- ============================================

-- STEP 1: Check which version of the function you have
SELECT
  proname as function_name,
  pronargs as num_parameters,
  proargtypes
FROM pg_proc
WHERE proname = 'create_agency_with_owner';

-- If num_parameters = 1, you have the OLD version (problem!)
-- If num_parameters = 2, you have the NEW version (should work)

-- ============================================
-- STEP 2: If you have the OLD version, run this fix:
-- ============================================

-- Drop the old single-parameter version
DROP FUNCTION IF EXISTS public.create_agency_with_owner(text) CASCADE;
DROP FUNCTION IF EXISTS public.create_agency_with_owner(text, text) CASCADE;

-- Create the NEW version that accepts product_type
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

  -- Insert the agency WITH product_type
  INSERT INTO public.agencies(
    name,
    slug,
    owner_user_id,
    product_type,  -- THIS IS THE KEY FIELD
    created_at,
    updated_at
  )
  VALUES (
    p_name,
    v_slug,
    v_user_id,
    p_product_type,  -- SAVE THE PRODUCT TYPE HERE
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_agency_with_owner(text, text) TO authenticated, service_role;

-- ============================================
-- STEP 3: TEST IT
-- ============================================

-- Test creating a compliance_only agency
SELECT * FROM public.create_agency_with_owner('Test Compliance Agency', 'compliance_only');

-- Verify it saved with the correct product_type
SELECT id, name, product_type
FROM public.agencies
WHERE name = 'Test Compliance Agency';
-- This should show product_type = 'compliance_only'

-- ============================================
-- SUCCESS!
-- ============================================
-- After running this, creating agencies with 'compliance_only'
-- from your UI should work correctly!