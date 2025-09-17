-- PHASE C: Fix create_agent_user RPC function
-- Issue: Function exists with wrong signature (expects password, first/last name)
-- Fix: Create overloaded version matching app expectations (agent_email, agent_name, agent_phone)

-- Create the correct overloaded function for agent creation
CREATE OR REPLACE FUNCTION public.create_agent_user(
  agent_email text,
  agent_name text,
  agent_phone text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_agent_id uuid;
BEGIN
  -- Check if caller is super admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied. Super admin privileges required.';
  END IF;

  -- Validate input
  IF agent_email IS NULL OR agent_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_required');
  END IF;

  -- Look up user by email in auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE LOWER(email) = LOWER(agent_email);

  -- If user doesn't exist in auth, return error (no auto-creation)
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'auth_user_not_found',
      'message', 'User must exist in auth.users first'
    );
  END IF;

  -- Check if profile exists, create if not
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_profile_id IS NULL THEN
    INSERT INTO public.profiles (id, email, name, phone, role)
    VALUES (v_user_id, agent_email, agent_name, agent_phone, 'agent')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      updated_at = NOW()
    RETURNING id INTO v_profile_id;
  ELSE
    -- Update existing profile
    UPDATE public.profiles
    SET name = COALESCE(agent_name, name),
        phone = COALESCE(agent_phone, phone),
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  -- Check if agent record exists, create if not
  SELECT id INTO v_agent_id
  FROM public.agents
  WHERE name = agent_name OR ext_ref = agent_email;

  IF v_agent_id IS NULL THEN
    INSERT INTO public.agents (id, ext_ref, name, team, active)
    VALUES (gen_random_uuid(), agent_email, agent_name, 'default', true)
    RETURNING id INTO v_agent_id;
  END IF;

  -- Also ensure user_profiles entry exists (for backward compatibility)
  INSERT INTO public.user_profiles (id, email, first_name, last_name, level)
  VALUES (
    v_user_id,
    agent_email,
    split_part(agent_name, ' ', 1),  -- First name from full name
    split_part(agent_name, ' ', 2),  -- Last name from full name
    1  -- Default level for agents
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    updated_at = NOW();

  -- Return success with IDs
  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'profile_id', v_profile_id,
    'agent_id', v_agent_id,
    'email', agent_email
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'database_error',
      'message', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_agent_user(text, text, text) TO authenticated;

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

-- Verify the function was created
SELECT
  proname,
  pg_get_function_identity_arguments(p.oid) as signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname = 'create_agent_user';