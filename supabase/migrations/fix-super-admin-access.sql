-- FIX SUPER ADMIN ACCESS
-- Run this with YOUR email address

-- STEP 1: Set your email here
DO $$
DECLARE
  user_email TEXT := 'YOUR_EMAIL_HERE@DOMAIN.COM'; -- CHANGE THIS TO YOUR EMAIL
  user_id UUID;
BEGIN
  -- Get the user ID from auth.users
  SELECT id INTO user_id FROM auth.users WHERE email = user_email;

  IF user_id IS NULL THEN
    RAISE EXCEPTION 'User not found with email: %', user_email;
  END IF;

  -- Fix 1: Set super admin in auth.users
  UPDATE auth.users
  SET
    is_super_admin = true,
    role = 'super_admin',
    raw_app_meta_data = jsonb_set(
      COALESCE(raw_app_meta_data, '{}'::jsonb),
      '{role}',
      '"super_admin"'
    ),
    raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{role}',
      '"super_admin"'
    )
  WHERE id = user_id;

  -- Fix 2: Ensure user exists in user_profiles with highest level
  INSERT INTO user_profiles (id, email, level, created_at, updated_at)
  VALUES (user_id, user_email, 5, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
  SET
    level = 5,
    email = EXCLUDED.email,
    updated_at = NOW();

  -- Fix 3: Ensure user exists in profiles table
  INSERT INTO profiles (id, email, role, created_at, updated_at)
  VALUES (user_id, user_email, 'super_admin', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
  SET
    role = 'super_admin',
    updated_at = NOW();

  -- Fix 4: Add to admin_users table
  INSERT INTO admin_users (id, email, admin_level, created_at)
  VALUES (user_id, user_email, 'super_admin', NOW())
  ON CONFLICT (id) DO UPDATE
  SET
    admin_level = 'super_admin',
    email = user_email;

  RAISE NOTICE 'Successfully updated user % to super admin', user_email;
END $$;

-- STEP 2: Fix the is_admin() function to check ALL tables
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_level INT;
  is_admin_user BOOLEAN;
  auth_role TEXT;
  profile_role TEXT;
BEGIN
  -- Check auth.users is_super_admin flag
  SELECT is_super_admin, role INTO is_admin_user, auth_role
  FROM auth.users
  WHERE id = auth.uid();

  IF is_admin_user = true OR auth_role IN ('admin', 'super_admin') THEN
    RETURN true;
  END IF;

  -- Check user_profiles level
  SELECT level INTO user_level
  FROM user_profiles
  WHERE id = auth.uid();

  IF user_level >= 3 THEN
    RETURN true;
  END IF;

  -- Check profiles role
  SELECT role INTO profile_role
  FROM profiles
  WHERE id = auth.uid();

  IF profile_role IN ('admin', 'super_admin') THEN
    RETURN true;
  END IF;

  -- Check admin_users table
  PERFORM 1 FROM admin_users
  WHERE id = auth.uid()
  AND admin_level IN ('admin', 'super_admin');

  IF FOUND THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 3: Create is_super_admin function if missing or fix it
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
DECLARE
  super_admin BOOLEAN;
  auth_role TEXT;
BEGIN
  -- Check auth.users
  SELECT is_super_admin, role INTO super_admin, auth_role
  FROM auth.users
  WHERE id = auth.uid();

  RETURN (super_admin = true OR auth_role = 'super_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 4: Verification queries (run these after to confirm)
-- Check your user status:
/*
SELECT
  au.email,
  au.is_super_admin as auth_super_admin,
  au.role as auth_role,
  up.level as profile_level,
  p.role as profile_role,
  ad.admin_level
FROM auth.users au
LEFT JOIN user_profiles up ON up.id = au.id
LEFT JOIN profiles p ON p.id = au.id
LEFT JOIN admin_users ad ON ad.id = au.id
WHERE au.email = 'YOUR_EMAIL_HERE@DOMAIN.COM';

-- Test the functions:
SELECT is_admin() as is_admin_check;
SELECT is_super_admin() as is_super_admin_check;
*/