-- Comprehensive cleanup script - keep only admin@syncedupsolutions.com
-- Run this in Supabase SQL Editor

-- Step 1: Find the admin user
SELECT id, email, created_at
FROM auth.users
WHERE email = 'admin@syncedupsolutions.com';

-- Step 2: Find admin's agency
SELECT a.id, a.name, a.slug, a.owner_user_id
FROM agencies a
JOIN auth.users u ON a.owner_user_id = u.id
WHERE u.email = 'admin@syncedupsolutions.com';

-- Step 3: Preview what will be deleted (all non-admin agencies)
SELECT a.id, a.name, a.slug, u.email as owner_email
FROM agencies a
LEFT JOIN auth.users u ON a.owner_user_id = u.id
WHERE u.email != 'admin@syncedupsolutions.com' OR u.email IS NULL;

-- Step 4: Preview profiles that will be deleted
SELECT p.id, p.email, p.full_name
FROM profiles p
WHERE p.email != 'admin@syncedupsolutions.com' OR p.email IS NULL;

-- Step 5: Preview auth users that will be deleted
SELECT id, email, created_at
FROM auth.users
WHERE email != 'admin@syncedupsolutions.com';

-- ============================================
-- DANGER ZONE: Uncomment below to execute cleanup
-- ============================================

-- Delete agency memberships (except admin's)
-- DELETE FROM user_agencies
-- WHERE agency_id IN (
--   SELECT a.id FROM agencies a
--   LEFT JOIN auth.users u ON a.owner_user_id = u.id
--   WHERE u.email != 'admin@syncedupsolutions.com' OR u.email IS NULL
-- );

-- Delete agencies (except admin's)
-- DELETE FROM agencies
-- WHERE owner_user_id NOT IN (
--   SELECT id FROM auth.users WHERE email = 'admin@syncedupsolutions.com'
-- );

-- Delete profiles (except admin's)
-- DELETE FROM profiles
-- WHERE email != 'admin@syncedupsolutions.com' OR email IS NULL;

-- Delete webhook tokens (except admin agency's)
-- DELETE FROM webhook_tokens
-- WHERE agency_id NOT IN (
--   SELECT a.id FROM agencies a
--   JOIN auth.users u ON a.owner_user_id = u.id
--   WHERE u.email = 'admin@syncedupsolutions.com'
-- );

-- Delete discovery sessions (except admin agency's)
-- DELETE FROM discovery_sessions
-- WHERE agency_id NOT IN (
--   SELECT a.id FROM agencies a
--   JOIN auth.users u ON a.owner_user_id = u.id
--   WHERE u.email = 'admin@syncedupsolutions.com'
-- );

-- ============================================
-- Delete auth users (LAST - do this manually in Supabase Dashboard)
-- Dashboard → Authentication → Users → Delete all except admin@syncedupsolutions.com
-- ============================================