-- User Management Hierarchy SQL
-- This migration ensures proper permission hierarchy for user management

-- 1. Update set_admin_level to enforce hierarchy
CREATE OR REPLACE FUNCTION public.set_admin_level(user_email TEXT, new_level TEXT)
RETURNS VOID AS $$
DECLARE
  current_user_level TEXT;
  target_user_level TEXT;
BEGIN
  -- Validate level
  IF new_level NOT IN ('operator', 'super', 'remove') THEN
    RAISE EXCEPTION 'Invalid admin level. Must be operator, super, or remove';
  END IF;

  -- Get current user's level
  current_user_level := public.get_user_level();

  -- Get target user's current level
  SELECT
    CASE
      WHEN admin_level = 'super' THEN 'super_admin'
      WHEN admin_level = 'operator' THEN 'admin'
      ELSE 'user'
    END INTO target_user_level
  FROM public.admin_users
  WHERE email = user_email;

  -- If target not in admin_users, check profiles
  IF target_user_level IS NULL THEN
    SELECT
      CASE
        WHEN role = 'admin' THEN 'admin'
        ELSE 'user'
      END INTO target_user_level
    FROM public.profiles
    WHERE email = user_email;
  END IF;

  -- Enforce hierarchy rules
  IF current_user_level != 'super_admin' THEN
    -- Non-super admins cannot modify admin levels at all
    RAISE EXCEPTION 'Only super admins can modify admin levels';
  END IF;

  -- Super admin can do anything
  IF new_level = 'remove' THEN
    -- Remove from admin_users
    DELETE FROM public.admin_users WHERE email = user_email;
    -- Update profile role
    UPDATE public.profiles SET role = 'user' WHERE email = user_email;
  ELSE
    -- Insert or update in admin_users
    INSERT INTO public.admin_users (email, admin_level, user_id)
    VALUES (
      user_email,
      new_level,
      (SELECT id FROM auth.users WHERE email = user_email)
    )
    ON CONFLICT (email) DO UPDATE
    SET admin_level = new_level;

    -- Update profile role
    UPDATE public.profiles SET role = 'admin' WHERE email = user_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Function to create agent users (for admins to create regular users)
CREATE OR REPLACE FUNCTION public.create_agent_user(
  agent_email TEXT,
  agent_name TEXT,
  agent_phone TEXT DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  existing_user_id uuid;
  new_profile_id uuid;
  result json;
BEGIN
  -- Only admins (operators or super admins) can create agents
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can create agent accounts';
  END IF;

  -- Check if email already exists in auth.users
  SELECT id INTO existing_user_id
  FROM auth.users
  WHERE email = agent_email;

  IF existing_user_id IS NOT NULL THEN
    -- User already exists in auth, just ensure profile exists
    INSERT INTO public.profiles (id, email, name, phone, role)
    VALUES (existing_user_id, agent_email, agent_name, agent_phone, 'user')
    ON CONFLICT (id) DO UPDATE
    SET
      name = COALESCE(EXCLUDED.name, profiles.name),
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      updated_at = NOW()
    RETURNING id INTO new_profile_id;

    result := json_build_object(
      'success', true,
      'profile_id', new_profile_id,
      'message', 'Profile updated for existing user',
      'user_exists', true
    );
  ELSE
    -- User doesn't exist - create profile and return instructions
    -- Note: Creating auth.users requires service role key or user signup
    INSERT INTO public.profiles (email, name, phone, role)
    VALUES (agent_email, agent_name, agent_phone, 'user')
    ON CONFLICT (email) DO UPDATE
    SET
      name = COALESCE(EXCLUDED.name, profiles.name),
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      updated_at = NOW()
    RETURNING id INTO new_profile_id;

    result := json_build_object(
      'success', true,
      'profile_id', new_profile_id,
      'message', 'Profile created. User needs to sign up with this email to activate account.',
      'user_exists', false,
      'signup_required', true
    );
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function to get users by level (for user management pages)
CREATE OR REPLACE FUNCTION public.get_users_by_level(level_filter TEXT DEFAULT 'all')
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  phone text,
  role text,
  user_level text,
  created_at timestamptz,
  last_sign_in_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.name,
    p.phone,
    p.role,
    CASE
      WHEN au.admin_level = 'super' THEN 'super_admin'
      WHEN au.admin_level = 'operator' THEN 'admin'
      WHEN p.role = 'admin' THEN 'admin'
      ELSE 'user'
    END as user_level,
    p.created_at,
    u.last_sign_in_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.admin_users au ON au.email = p.email
  WHERE
    CASE
      WHEN level_filter = 'super_admin' THEN au.admin_level = 'super'
      WHEN level_filter = 'admin' THEN (au.admin_level IN ('super', 'operator') OR p.role = 'admin')
      WHEN level_filter = 'operator' THEN au.admin_level = 'operator'
      WHEN level_filter = 'user' THEN (au.admin_level IS NULL AND (p.role != 'admin' OR p.role IS NULL))
      ELSE true
    END
  ORDER BY
    CASE
      WHEN au.admin_level = 'super' THEN 1
      WHEN au.admin_level = 'operator' THEN 2
      WHEN p.role = 'admin' THEN 3
      ELSE 4
    END,
    p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to check if current user can manage another user
CREATE OR REPLACE FUNCTION public.can_manage_user(target_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  current_level TEXT;
  target_level TEXT;
BEGIN
  -- Get current user's level
  current_level := public.get_user_level();

  -- Get target user's level
  SELECT
    CASE
      WHEN admin_level = 'super' THEN 'super_admin'
      WHEN admin_level = 'operator' THEN 'admin'
      ELSE 'user'
    END INTO target_level
  FROM public.admin_users
  WHERE email = target_email;

  -- If not in admin_users, check profiles
  IF target_level IS NULL THEN
    SELECT
      CASE
        WHEN role = 'admin' THEN 'admin'
        ELSE 'user'
      END INTO target_level
    FROM public.profiles
    WHERE email = target_email;
  END IF;

  -- Default to user if not found
  IF target_level IS NULL THEN
    target_level := 'user';
  END IF;

  -- Super admins can manage everyone
  IF current_level = 'super_admin' THEN
    RETURN true;
  END IF;

  -- Operators can only manage regular users
  IF current_level = 'admin' AND target_level = 'user' THEN
    RETURN true;
  END IF;

  -- Users cannot manage anyone
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update permissions for all functions
GRANT EXECUTE ON FUNCTION public.set_admin_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_by_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_user TO authenticated;

-- 6. Create a view for easy user management
CREATE OR REPLACE VIEW public.user_management_view AS
SELECT
  p.id,
  p.email,
  p.name,
  p.phone,
  p.role,
  CASE
    WHEN au.admin_level = 'super' THEN 'super_admin'
    WHEN au.admin_level = 'operator' THEN 'admin'
    WHEN p.role = 'admin' THEN 'admin'
    ELSE 'user'
  END as user_level,
  au.admin_level,
  p.created_at,
  p.updated_at,
  u.last_sign_in_at,
  u.email_confirmed_at
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
LEFT JOIN public.admin_users au ON au.email = p.email
ORDER BY
  CASE
    WHEN au.admin_level = 'super' THEN 1
    WHEN au.admin_level = 'operator' THEN 2
    WHEN p.role = 'admin' THEN 3
    ELSE 4
  END,
  p.created_at DESC;

-- Grant read access to authenticated users
GRANT SELECT ON public.user_management_view TO authenticated;