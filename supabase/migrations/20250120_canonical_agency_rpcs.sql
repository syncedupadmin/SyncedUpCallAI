-- Canonical Agency Member Management RPCs
-- This migration creates the exact RPC functions needed for agency member management

-- Step 1: Drop any existing functions to ensure clean slate
DROP FUNCTION IF EXISTS public.is_agency_admin(uuid);
DROP FUNCTION IF EXISTS public.get_user_id_by_email(text);
DROP FUNCTION IF EXISTS public.add_user_to_agency(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.remove_user_from_agency(uuid, uuid);
DROP FUNCTION IF EXISTS public.add_user_to_agency_by_email(uuid, text, text);

-- Step 2: Create is_agency_admin helper function
CREATE OR REPLACE FUNCTION public.is_agency_admin(p_agency_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.agencies
    WHERE id = p_agency_id
    AND owner_user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.user_agencies
    WHERE agency_id = p_agency_id
    AND user_id = auth.uid()
    AND role IN ('admin', 'owner')
  );
END;
$$;

-- Step 3: Create get_user_id_by_email helper function
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- First try profiles table
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  -- If not found in profiles, try auth.identities
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id
    FROM auth.identities
    WHERE lower(email) = lower(p_email)
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN v_user_id;
END;
$$;

-- Step 4: Create add_user_to_agency function
CREATE OR REPLACE FUNCTION public.add_user_to_agency(
  p_agency uuid,
  p_user uuid,
  p_role text DEFAULT 'agent'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Validate role
  IF p_role NOT IN ('admin', 'agent') THEN
    RAISE EXCEPTION 'Invalid role. Must be admin or agent';
  END IF;

  -- Check if caller has permission
  IF NOT public.is_agency_admin(p_agency) THEN
    RAISE EXCEPTION 'You do not have permission to manage this agency';
  END IF;

  -- Check if user already exists in agency
  IF EXISTS (
    SELECT 1 FROM public.user_agencies
    WHERE user_id = p_user
    AND agency_id = p_agency
  ) THEN
    -- Update existing role
    UPDATE public.user_agencies
    SET role = p_role,
        updated_at = now()
    WHERE user_id = p_user
    AND agency_id = p_agency;
  ELSE
    -- Insert new membership
    INSERT INTO public.user_agencies (user_id, agency_id, role, created_at)
    VALUES (p_user, p_agency, p_role, now());
  END IF;
END;
$$;

-- Step 5: Create remove_user_from_agency function
CREATE OR REPLACE FUNCTION public.remove_user_from_agency(
  p_agency uuid,
  p_user uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_count integer;
  v_user_role text;
BEGIN
  -- Check if caller has permission
  IF NOT public.is_agency_admin(p_agency) THEN
    RAISE EXCEPTION 'You do not have permission to manage this agency';
  END IF;

  -- Check if user is the agency owner
  IF EXISTS (
    SELECT 1 FROM public.agencies
    WHERE id = p_agency
    AND owner_user_id = p_user
  ) THEN
    RAISE EXCEPTION 'Cannot remove the agency owner';
  END IF;

  -- Get the user's role
  SELECT role INTO v_user_role
  FROM public.user_agencies
  WHERE user_id = p_user
  AND agency_id = p_agency;

  -- If user is admin, check if they're the last admin
  IF v_user_role IN ('admin', 'owner') THEN
    SELECT COUNT(*)::integer INTO v_admin_count
    FROM public.user_agencies
    WHERE agency_id = p_agency
    AND role IN ('admin', 'owner')
    AND user_id != p_user;

    -- Also check if there's an owner in agencies table
    IF EXISTS (
      SELECT 1 FROM public.agencies
      WHERE id = p_agency
      AND owner_user_id IS NOT NULL
      AND owner_user_id != p_user
    ) THEN
      v_admin_count := v_admin_count + 1;
    END IF;

    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last admin from the agency';
    END IF;
  END IF;

  -- Remove the membership
  DELETE FROM public.user_agencies
  WHERE user_id = p_user
  AND agency_id = p_agency;
END;
$$;

-- Step 6: Create add_user_to_agency_by_email convenience function
CREATE OR REPLACE FUNCTION public.add_user_to_agency_by_email(
  p_agency uuid,
  p_email text,
  p_role text DEFAULT 'agent'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_user_name text;
BEGIN
  -- Get user ID from email
  v_user_id := public.get_user_id_by_email(p_email);

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found with that email'
    );
  END IF;

  -- Get user name from profiles
  SELECT name INTO v_user_name
  FROM public.profiles
  WHERE id = v_user_id;

  -- Try to add to agency
  BEGIN
    PERFORM public.add_user_to_agency(p_agency, v_user_id, p_role);

    RETURN json_build_object(
      'success', true,
      'user_id', v_user_id,
      'name', v_user_name
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN json_build_object(
        'success', false,
        'error', SQLERRM
      );
  END;
END;
$$;

-- Step 7: Revoke all public access
REVOKE EXECUTE ON FUNCTION public.is_agency_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_user_to_agency(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_user_from_agency(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_user_to_agency_by_email(uuid, text, text) FROM PUBLIC;

-- Step 8: Grant execute permissions to authenticated users only
GRANT EXECUTE ON FUNCTION public.is_agency_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_user_to_agency(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_user_from_agency(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_user_to_agency_by_email(uuid, text, text) TO authenticated;

-- Step 9: Add helpful comments
COMMENT ON FUNCTION public.is_agency_admin IS 'Check if current user is admin/owner of the agency';
COMMENT ON FUNCTION public.get_user_id_by_email IS 'Look up user ID by email from profiles or auth.identities';
COMMENT ON FUNCTION public.add_user_to_agency IS 'Add or update a user in an agency with permission checks';
COMMENT ON FUNCTION public.remove_user_from_agency IS 'Remove a user from an agency with last admin protection';
COMMENT ON FUNCTION public.add_user_to_agency_by_email IS 'Convenience function to add user to agency by email';

-- Step 10: Verify the functions are created with correct signatures
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND p.proname IN ('is_agency_admin', 'get_user_id_by_email', 'add_user_to_agency', 'remove_user_from_agency', 'add_user_to_agency_by_email')
ORDER BY p.proname;