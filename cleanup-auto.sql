-- Automatic cleanup script - finds admin UUID automatically
-- Run this in Supabase SQL Editor

-- Step 1: Find admin user ID (run this first to verify)
SELECT id, email FROM auth.users WHERE email = 'admin@syncedupsolutions.com';

-- Step 2: Delete everything except admin's data (run all at once)
DO $$
DECLARE
  admin_user_id UUID;
  admin_agency_id UUID;
BEGIN
  -- Get admin user ID
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'admin@syncedupsolutions.com';

  IF admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Admin user not found!';
  END IF;

  -- Get admin agency ID
  SELECT id INTO admin_agency_id
  FROM agencies
  WHERE owner_user_id = admin_user_id;

  RAISE NOTICE 'Admin user ID: %', admin_user_id;
  RAISE NOTICE 'Admin agency ID: %', admin_agency_id;

  -- Delete discovery sessions (except admin's)
  DELETE FROM discovery_sessions
  WHERE agency_id IS NULL OR agency_id != admin_agency_id;
  RAISE NOTICE 'Deleted discovery sessions';

  -- Delete webhook tokens (except admin's)
  DELETE FROM webhook_tokens
  WHERE agency_id IS NULL OR agency_id != admin_agency_id;
  RAISE NOTICE 'Deleted webhook tokens';

  -- Delete user_agencies (except admin's)
  DELETE FROM user_agencies
  WHERE agency_id IS NULL OR agency_id != admin_agency_id;
  RAISE NOTICE 'Deleted user_agencies';

  -- Delete agencies (except admin's)
  DELETE FROM agencies
  WHERE owner_user_id != admin_user_id;
  RAISE NOTICE 'Deleted agencies';

  -- Delete profiles (except admin's)
  DELETE FROM profiles
  WHERE email != 'admin@syncedupsolutions.com' OR email IS NULL;
  RAISE NOTICE 'Deleted profiles';

  RAISE NOTICE 'Cleanup complete!';
END $$;

-- Step 3: Verify cleanup
SELECT 'Remaining agencies:' as info;
SELECT id, name, slug, owner_user_id FROM agencies;

SELECT 'Remaining profiles:' as info;
SELECT id, email, full_name FROM profiles;

-- Step 4: MANUALLY delete auth users in Supabase Dashboard
-- Go to: Dashboard → Authentication → Users
-- Delete all users except admin@syncedupsolutions.com