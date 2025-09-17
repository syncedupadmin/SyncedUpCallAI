-- =====================================================
-- PRECISE MIGRATION: Simplify to 2 User Types
-- =====================================================
-- Based on actual function signatures found in database

-- =====================================================
-- STEP 1: Drop existing functions with EXACT signatures
-- =====================================================

-- Drop views that depend on these functions
DROP VIEW IF EXISTS public.user_management_view CASCADE;

-- Drop with exact signatures found
DROP FUNCTION IF EXISTS public.get_users_by_level_v2(target_level integer) CASCADE;
DROP FUNCTION IF EXISTS public.get_users_by_level(level_filter text) CASCADE;
DROP FUNCTION IF EXISTS public.create_agent_user(agent_email text, agent_name text, agent_phone text) CASCADE;

-- Note: set_admin_level and can_manage_user don't exist yet, so no need to drop

-- =====================================================
-- STEP 2: Update Core Authentication Functions
-- =====================================================

-- Make is_admin() check for any admin user
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  current_user_email TEXT;
BEGIN
  SELECT email INTO current_user_email
  FROM auth.users
  WHERE id = auth.uid();

  IF current_user_email IS NULL THEN
    RETURN false;
  END IF;

  -- Any user in admin_users table is an admin (operator or super)
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE email = current_user_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make is_super_admin() identical to is_admin()
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- All admins are now equal (operators become super)
  RETURN public.is_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Simplify get_user_level() to return only 'admin' or 'user'
CREATE OR REPLACE FUNCTION public.get_user_level()
RETURNS TEXT AS $$
DECLARE
  current_user_email TEXT;
BEGIN
  SELECT email INTO current_user_email
  FROM auth.users
  WHERE id = auth.uid();

  IF current_user_email IS NULL THEN
    RETURN 'none';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE email = current_user_email
  ) THEN
    RETURN 'admin';
  END IF;

  RETURN 'user';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STEP 3: Migrate Data - Convert operator to super
-- =====================================================

-- Convert the 1 operator to super admin
UPDATE public.admin_users
SET admin_level = 'super'
WHERE admin_level = 'operator';

-- Verify migration
DO $$
DECLARE
  admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO admin_count
  FROM public.admin_users
  WHERE admin_level = 'super';

  RAISE NOTICE 'Migration complete: % admins now have full access', admin_count;
END $$;

-- =====================================================
-- STEP 4: Create new helper functions
-- =====================================================

-- Create set_admin_level function (new)
CREATE FUNCTION public.set_admin_level(user_email TEXT, new_level TEXT)
RETURNS VOID AS $$
BEGIN
  -- Accept 'admin', 'super', 'operator' for backwards compatibility, or 'remove'
  IF new_level NOT IN ('admin', 'remove', 'super', 'operator') THEN
    RAISE EXCEPTION 'Invalid admin level';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change admin levels';
  END IF;

  IF new_level = 'remove' THEN
    DELETE FROM public.admin_users WHERE email = user_email;
    UPDATE public.profiles SET role = 'user' WHERE email = user_email;
  ELSE
    -- All admin types become 'super' internally
    INSERT INTO public.admin_users (email, admin_level, user_id)
    VALUES (
      user_email,
      'super',
      (SELECT id FROM auth.users WHERE email = user_email)
    )
    ON CONFLICT (email) DO UPDATE
    SET admin_level = 'super';

    UPDATE public.profiles SET role = 'admin' WHERE email = user_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate create_agent_user with same signature
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can create agent accounts';
  END IF;

  SELECT id INTO existing_user_id
  FROM auth.users
  WHERE email = agent_email;

  IF existing_user_id IS NOT NULL THEN
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

-- Create NEW get_users_by_level with text parameter
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
      -- Handle all variations of admin level names
      WHEN level_filter IN ('admin', 'super', 'operator') THEN au.email IS NOT NULL
      WHEN level_filter = 'user' THEN au.email IS NULL
      ELSE true  -- 'all' or any other value
    END
  ORDER BY
    CASE
      WHEN au.email IS NOT NULL THEN 1
      ELSE 2
    END,
    p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create NEW get_users_by_level_v2 that accepts TEXT (not integer!)
CREATE FUNCTION public.get_users_by_level_v2(level TEXT DEFAULT 'all')
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

-- Create can_manage_user function (new)
CREATE FUNCTION public.can_manage_user(target_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- All admins can manage all users
  RETURN public.is_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STEP 5: Recreate view
-- =====================================================

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
-- STEP 6: Grant permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_by_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_by_level_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_user TO authenticated;
GRANT SELECT ON public.user_management_view TO authenticated;

-- =====================================================
-- FINAL VERIFICATION
-- =====================================================

-- Check results
SELECT 'Migration Complete!' as status,
       COUNT(*) as total_admins,
       'All operators promoted to super admin' as note
FROM public.admin_users
WHERE admin_level = 'super';

-- Test the functions
SELECT
  'Testing Functions' as test,
  public.get_user_level() as user_level,
  public.is_admin() as is_admin,
  public.is_super_admin() as is_super_admin;