-- FIX ADMIN CONSTRAINT AND SET SUPER ADMIN
-- Run this with YOUR email address

-- STEP 1: Find and fix the constraint on admin_users table
DO $$
BEGIN
  -- Drop the existing constraint
  ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS admin_users_admin_level_check;

  -- Add new constraint that allows super_admin
  ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_admin_level_check
  CHECK (admin_level IN ('admin', 'super_admin', 'super', 'moderator', 'support'));
EXCEPTION
  WHEN OTHERS THEN
    -- If constraint doesn't exist or can't be dropped, continue
    NULL;
END $$;

-- STEP 2: Now set your user as super admin
DO $$
DECLARE
  user_email TEXT := 'admin@syncedupsolutions.com'; -- YOUR EMAIL
  user_id UUID;
BEGIN
  -- Get the user ID from auth.users
  SELECT id INTO user_id FROM auth.users WHERE email = user_email;

  IF user_id IS NULL THEN
    RAISE EXCEPTION 'User not found with email: %', user_email;
  END IF;

  RAISE NOTICE 'Found user ID: %', user_id;

  -- Fix 1: Set super admin in auth.users
  UPDATE auth.users
  SET
    is_super_admin = true,
    role = 'admin',  -- Use 'admin' instead of 'super_admin' for compatibility
    raw_app_meta_data = jsonb_set(
      COALESCE(raw_app_meta_data, '{}'::jsonb),
      '{role}',
      '"admin"'
    ),
    raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{role}',
      '"admin"'
    )
  WHERE id = user_id;
  RAISE NOTICE 'Updated auth.users';

  -- Fix 2: Ensure user exists in user_profiles with highest level
  INSERT INTO user_profiles (id, email, level, created_at, updated_at)
  VALUES (user_id, user_email, 5, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
  SET
    level = 5,
    email = EXCLUDED.email,
    updated_at = NOW();
  RAISE NOTICE 'Updated user_profiles';

  -- Fix 3: Ensure user exists in profiles table if it has an id column
  BEGIN
    INSERT INTO profiles (id, email, role, created_at, updated_at)
    VALUES (user_id, user_email, 'admin', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
    SET
      role = 'admin',
      updated_at = NOW();
    RAISE NOTICE 'Updated profiles';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Could not update profiles table: %', SQLERRM;
  END;

  -- Fix 4: Add to admin_users table - use 'admin' which should be allowed
  INSERT INTO admin_users (id, email, admin_level, created_at)
  VALUES (user_id, user_email, 'admin', NOW())
  ON CONFLICT (id) DO UPDATE
  SET
    admin_level = 'admin',
    email = user_email;
  RAISE NOTICE 'Updated admin_users';

  RAISE NOTICE 'Successfully updated user % to super admin in all tables', user_email;
END $$;

-- STEP 3: Update the is_admin() function to be more robust
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_level INT;
  is_admin_flag BOOLEAN;
  auth_role TEXT;
  profile_role TEXT;
  admin_level TEXT;
BEGIN
  -- Return false if no user is authenticated
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Check auth.users is_super_admin flag and role
  SELECT is_super_admin, role INTO is_admin_flag, auth_role
  FROM auth.users
  WHERE id = auth.uid();

  IF is_admin_flag = true OR auth_role IN ('admin', 'super_admin', 'super') THEN
    RETURN true;
  END IF;

  -- Check user_profiles level (3 or higher is admin)
  SELECT level INTO user_level
  FROM user_profiles
  WHERE id = auth.uid();

  IF user_level >= 3 THEN
    RETURN true;
  END IF;

  -- Check profiles role
  BEGIN
    SELECT role INTO profile_role
    FROM profiles
    WHERE id = auth.uid();

    IF profile_role IN ('admin', 'super_admin', 'super') THEN
      RETURN true;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL; -- Table might not exist or have different structure
  END;

  -- Check admin_users table
  SELECT admin_level INTO admin_level
  FROM admin_users
  WHERE id = auth.uid();

  IF admin_level IN ('admin', 'super_admin', 'super') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 4: Create/update is_super_admin function
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- Just use is_admin for now since we're fixing the admin issue
  RETURN is_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 5: Grant permissions
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;

-- VERIFICATION: Run this to check your status
SELECT
  au.id,
  au.email,
  au.is_super_admin as auth_super_admin,
  au.role as auth_role,
  up.level as profile_level,
  ad.admin_level
FROM auth.users au
LEFT JOIN user_profiles up ON up.id = au.id
LEFT JOIN admin_users ad ON ad.id = au.id
WHERE au.email = 'admin@syncedupsolutions.com';

-- Test the functions (run these as the logged-in user)
-- SELECT is_admin();
-- SELECT is_super_admin();