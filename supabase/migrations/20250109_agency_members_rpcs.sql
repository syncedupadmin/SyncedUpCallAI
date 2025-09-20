-- Create RPC to look up user ID by email
-- Works with both profiles.email and auth.identities for SSO support
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated;

-- Since user_agencies has write-blocked RLS, we need server-side RPCs
-- These will run with SECURITY DEFINER to bypass RLS

-- RPC to add a user to an agency (bypasses RLS block)
CREATE OR REPLACE FUNCTION public.add_user_to_agency(
  p_agency uuid,
  p_user uuid,
  p_role text DEFAULT 'member'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller has permission (is admin/owner of the agency)
  IF NOT EXISTS (
    SELECT 1 FROM public.agencies
    WHERE id = p_agency
    AND owner_user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_agencies
    WHERE agency_id = p_agency
    AND user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'You do not have permission to manage this agency';
  END IF;

  -- Insert or update the membership
  INSERT INTO public.user_agencies (user_id, agency_id, role, created_at)
  VALUES (p_user, p_agency, p_role, now())
  ON CONFLICT (user_id, agency_id)
  DO UPDATE SET role = EXCLUDED.role, updated_at = now();
END;
$$;

-- RPC to remove a user from an agency (bypasses RLS block)
CREATE OR REPLACE FUNCTION public.remove_user_from_agency(
  p_agency uuid,
  p_user uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller has permission (is admin/owner of the agency)
  IF NOT EXISTS (
    SELECT 1 FROM public.agencies
    WHERE id = p_agency
    AND owner_user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_agencies
    WHERE agency_id = p_agency
    AND user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'You do not have permission to manage this agency';
  END IF;

  -- Don't allow removing the owner
  IF EXISTS (
    SELECT 1 FROM public.agencies
    WHERE id = p_agency
    AND owner_user_id = p_user
  ) THEN
    RAISE EXCEPTION 'Cannot remove the agency owner';
  END IF;

  -- Remove the membership
  DELETE FROM public.user_agencies
  WHERE user_id = p_user
  AND agency_id = p_agency;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.add_user_to_agency(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_user_from_agency(uuid, uuid) TO authenticated;

-- Add helper RPC to add user by email (combines lookup + add)
CREATE OR REPLACE FUNCTION public.add_user_to_agency_by_email(
  p_agency uuid,
  p_email text,
  p_role text DEFAULT 'member'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_name text;
BEGIN
  -- Get user ID from email
  v_user_id := public.get_user_id_by_email(p_email);

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found with that email');
  END IF;

  -- Get user name from profiles
  SELECT name INTO v_user_name
  FROM public.profiles
  WHERE id = v_user_id;

  -- Add to agency
  PERFORM public.add_user_to_agency(p_agency, v_user_id, p_role);

  RETURN json_build_object(
    'success', true,
    'user_id', v_user_id,
    'name', v_user_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_user_to_agency_by_email(uuid, text, text) TO authenticated;

-- Add comment to explain the setup
COMMENT ON FUNCTION public.get_user_id_by_email IS 'Looks up user ID by email from profiles or auth.identities';
COMMENT ON FUNCTION public.add_user_to_agency IS 'Adds a user to an agency with permission check (bypasses RLS block)';
COMMENT ON FUNCTION public.remove_user_from_agency IS 'Removes a user from an agency with permission check (bypasses RLS block)';
COMMENT ON FUNCTION public.add_user_to_agency_by_email IS 'Convenience function to add user to agency by email';