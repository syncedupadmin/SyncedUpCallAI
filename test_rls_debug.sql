-- Debug RLS policies to see what's happening

-- 1. Check current user
SELECT 
  auth.uid() as current_user_id,
  auth.email() as current_email;

-- 2. Check if is_super_admin works
SELECT is_super_admin() as am_i_super_admin;

-- 3. Check what agencies exist
SELECT id, name, owner_user_id FROM agencies;

-- 4. Check what user_agencies memberships exist
SELECT 
  ua.user_id,
  ua.agency_id,
  ua.role,
  a.name as agency_name
FROM user_agencies ua
LEFT JOIN agencies a ON a.id = ua.agency_id;

-- 5. Check the current RLS policy
SELECT 
  policyname,
  qual
FROM pg_policies
WHERE tablename = 'user_agencies';
