-- =====================================================
-- SIMPLIFY USER ROLES: Migrate from 3-tier to 2-tier system
-- From: user/operator/super_admin → To: user/admin
-- =====================================================
-- This migration simplifies the authentication system while preserving
-- all existing functionality. Both is_admin() and is_super_admin()
-- will return the same value, ensuring no breaking changes.

-- =====================================================
-- STEP 1: Update Core Authentication Functions
-- =====================================================

-- 1.1: Simplify is_admin() to check for any admin user
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  current_user_email TEXT;
BEGIN
  -- Get the current authenticated user's email
  SELECT email INTO current_user_email
  FROM auth.users
  WHERE id = auth.uid();

  -- If no authenticated user, return false
  IF current_user_email IS NULL THEN
    RETURN false;
  END IF;

  -- Check if user exists in admin_users table (any level)
  -- This now includes both former operators and super admins
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE email = current_user_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1.2: Make is_super_admin() identical to is_admin()
-- This ensures all existing code using is_super_admin() continues to work
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Now both functions return the same value
  -- All admins have full access to the admin portal
  RETURN public.is_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1.3: Simplify get_user_level() to return only 'admin' or 'user'
CREATE OR REPLACE FUNCTION public.get_user_level()
RETURNS TEXT AS $$
DECLARE
  current_user_email TEXT;
BEGIN
  -- Get the current authenticated user's email
  SELECT email INTO current_user_email
  FROM auth.users
  WHERE id = auth.uid();

  -- If no authenticated user, return 'none'
  IF current_user_email IS NULL THEN
    RETURN 'none';
  END IF;

  -- Check if user is an admin
  IF EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE email = current_user_email
  ) THEN
    RETURN 'admin';
  END IF;

  -- Default to regular user
  RETURN 'user';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STEP 2: Migrate Existing Data
-- =====================================================

-- 2.1: Convert all operators to full admins
-- This gives former operators access to the full admin portal
UPDATE public.admin_users
SET admin_level = 'super'
WHERE admin_level = 'operator';

-- 2.2: Log the migration for audit purposes
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  -- Count how many users were migrated
  SELECT COUNT(*) INTO migrated_count
  FROM public.admin_users
  WHERE admin_level = 'super';

  RAISE NOTICE 'Migration complete: % admin users now have full admin access', migrated_count;
END $$;

-- =====================================================
-- STEP 3: Update Helper Functions
-- =====================================================

-- 3.1: Simplify set_admin_level function
CREATE OR REPLACE FUNCTION public.set_admin_level(user_email TEXT, new_level TEXT)
RETURNS VOID AS $$
BEGIN
  -- Validate level (now only 'admin' or 'remove')
  IF new_level NOT IN ('admin', 'remove') THEN
    RAISE EXCEPTION 'Invalid admin level. Must be admin or remove';
  END IF;

  -- Only admins can change admin levels
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change admin levels';
  END IF;

  IF new_level = 'remove' THEN
    -- Remove from admin_users
    DELETE FROM public.admin_users WHERE email = user_email;
    -- Update profile role
    UPDATE public.profiles SET role = 'user' WHERE email = user_email;
  ELSE
    -- Add as admin (all admins are now equal)
    INSERT INTO public.admin_users (email, admin_level, user_id)
    VALUES (
      user_email,
      'super', -- All admins now have 'super' level internally
      (SELECT id FROM auth.users WHERE email = user_email)
    )
    ON CONFLICT (email) DO UPDATE
    SET admin_level = 'super';

    -- Update profile role
    UPDATE public.profiles SET role = 'admin' WHERE email = user_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.2: Update create_agent_user to reflect simplified roles
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
  -- Only admins can create agent accounts
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

-- 3.3: Simplify get_users_by_level function
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
      WHEN au.email IS NOT NULL THEN 'admin'
      ELSE 'user'
    END as user_level,
    p.created_at,
    u.last_sign_in_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.admin_users au ON au.email = p.email
  WHERE
    CASE
      WHEN level_filter = 'admin' THEN au.email IS NOT NULL
      WHEN level_filter = 'user' THEN au.email IS NULL
      ELSE true
    END
  ORDER BY
    CASE
      WHEN au.email IS NOT NULL THEN 1
      ELSE 2
    END,
    p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.4: Simplify can_manage_user function
CREATE OR REPLACE FUNCTION public.can_manage_user(target_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admins can manage all users
  -- Regular users cannot manage anyone
  RETURN public.is_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STEP 4: Update Views
-- =====================================================

-- 4.1: Simplify user management view
CREATE OR REPLACE VIEW public.user_management_view AS
SELECT
  p.id,
  p.email,
  p.name,
  p.phone,
  p.role,
  CASE
    WHEN au.email IS NOT NULL THEN 'admin'
    ELSE 'user'
  END as user_level,
  au.admin_level, -- Keep for backwards compatibility
  p.created_at,
  p.updated_at,
  u.last_sign_in_at,
  u.email_confirmed_at
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
LEFT JOIN public.admin_users au ON au.email = p.email
ORDER BY
  CASE
    WHEN au.email IS NOT NULL THEN 1
    ELSE 2
  END,
  p.created_at DESC;

-- =====================================================
-- STEP 5: Grant Permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_by_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_user TO authenticated;
GRANT SELECT ON public.user_management_view TO authenticated;

-- =====================================================
-- STEP 6: Verification Queries
-- =====================================================

-- Verify the migration
SELECT
  'Total Admins' as metric,
  COUNT(*) as count
FROM public.admin_users
UNION ALL
SELECT
  'Total Users' as metric,
  COUNT(*) as count
FROM public.profiles
WHERE email NOT IN (SELECT email FROM public.admin_users);

-- Test the functions
SELECT
  'Current User Level' as test,
  public.get_user_level() as result
UNION ALL
SELECT
  'Is Admin' as test,
  public.is_admin()::text as result
UNION ALL
SELECT
  'Is Super Admin' as test,
  public.is_super_admin()::text as result;

-- =====================================================
-- NOTES:
-- =====================================================
-- 1. The admin_level column is kept for backwards compatibility
-- 2. All former operators now have full admin access
-- 3. Both is_admin() and is_super_admin() return the same value
-- 4. No breaking changes - all existing code continues to work
-- 5. To rollback: restore original function definitions from backup