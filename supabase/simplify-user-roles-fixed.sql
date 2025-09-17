-- =====================================================
-- SIMPLIFY USER ROLES: Migrate from 3-tier to 2-tier system
-- FIXED VERSION - Handles existing functions properly
-- =====================================================
-- This migration simplifies the authentication system while preserving
-- all existing functionality. Both is_admin() and is_super_admin()
-- will return the same value, ensuring no breaking changes.

-- =====================================================
-- STEP 1: Drop existing functions that need signature changes
-- =====================================================

-- Drop functions that will be recreated
DROP FUNCTION IF EXISTS public.create_agent_user(text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_users_by_level(text) CASCADE;
DROP FUNCTION IF EXISTS public.set_admin_level(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_user(text) CASCADE;

-- Drop views that depend on these functions
DROP VIEW IF EXISTS public.user_management_view CASCADE;

-- =====================================================
-- STEP 2: Update Core Authentication Functions
-- =====================================================

-- 2.1: Simplify is_admin() to check for any admin user
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

-- 2.2: Make is_super_admin() identical to is_admin()
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Now both functions return the same value
  -- All admins have full access to the admin portal
  RETURN public.is_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.3: Simplify get_user_level() to return only 'admin' or 'user'
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
-- STEP 3: Migrate Existing Data
-- =====================================================

-- 3.1: Convert all operators to full admins
UPDATE public.admin_users
SET admin_level = 'super'
WHERE admin_level = 'operator';

-- 3.2: Log the migration for audit purposes
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
-- STEP 4: Recreate Helper Functions with new signatures
-- =====================================================

-- 4.1: Recreate set_admin_level function
CREATE FUNCTION public.set_admin_level(user_email TEXT, new_level TEXT)
RETURNS VOID AS $$
BEGIN
  -- Validate level (now only 'admin' or 'remove')
  IF new_level NOT IN ('admin', 'remove', 'super', 'operator') THEN
    RAISE EXCEPTION 'Invalid admin level. Must be admin, super, operator, or remove';
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
    -- Add as admin (all admins are now equal, but accept legacy values)
    INSERT INTO public.admin_users (email, admin_level, user_id)
    VALUES (
      user_email,
      CASE
        WHEN new_level IN ('admin', 'super') THEN 'super'
        WHEN new_level = 'operator' THEN 'super' -- Convert operator to super
        ELSE 'super'
      END,
      (SELECT id FROM auth.users WHERE email = user_email)
    )
    ON CONFLICT (email) DO UPDATE
    SET admin_level = 'super';

    -- Update profile role
    UPDATE public.profiles SET role = 'admin' WHERE email = user_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.2: Recreate create_agent_user with same signature
CREATE FUNCTION public.create_agent_user(
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

-- 4.3: Recreate get_users_by_level function
CREATE FUNCTION public.get_users_by_level(level_filter TEXT DEFAULT 'all')
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
      WHEN level_filter = 'super' THEN au.email IS NOT NULL -- Super and admin are now the same
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

-- 4.4: Recreate can_manage_user function
CREATE FUNCTION public.can_manage_user(target_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admins can manage all users
  -- Regular users cannot manage anyone
  RETURN public.is_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STEP 5: Recreate Views
-- =====================================================

-- 5.1: Recreate user management view
CREATE VIEW public.user_management_view AS
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
-- STEP 6: Grant Permissions
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
-- STEP 7: Create get_users_by_level_v2 for backwards compatibility
-- =====================================================

-- Create alias for backwards compatibility with existing code
CREATE OR REPLACE FUNCTION public.get_users_by_level_v2(level TEXT DEFAULT 'all')
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
  -- Just call the main function
  RETURN QUERY SELECT * FROM public.get_users_by_level(level);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_users_by_level_v2 TO authenticated;

-- =====================================================
-- STEP 8: Verification Queries
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
-- 1. This version properly drops and recreates functions
-- 2. The admin_level column is kept for backwards compatibility
-- 3. All former operators now have full admin access
-- 4. Both is_admin() and is_super_admin() return the same value
-- 5. No breaking changes - all existing code continues to work
-- 6. Added get_users_by_level_v2 alias for backwards compatibility