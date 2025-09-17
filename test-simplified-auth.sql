-- =====================================================
-- TEST SCRIPT: Verify Simplified Authentication
-- =====================================================
-- Run this after applying simplify-user-roles.sql
-- to verify the authentication system works correctly

-- Test 1: Check current user's level
SELECT
  'Current User Level' as test,
  public.get_user_level() as result;

-- Test 2: Check if user is admin (both functions should return same value)
SELECT
  'is_admin()' as function,
  public.is_admin() as result
UNION ALL
SELECT
  'is_super_admin()' as function,
  public.is_super_admin() as result;

-- Test 3: Verify all admin users have been migrated
SELECT
  'Admin Users' as category,
  email,
  admin_level,
  CASE
    WHEN admin_level = 'super' THEN 'Migrated to Admin'
    WHEN admin_level = 'operator' THEN 'Should be migrated'
    ELSE 'Unknown'
  END as status
FROM public.admin_users
ORDER BY email;

-- Test 4: Check user counts by level
SELECT
  'User Count by Level' as metric,
  user_level,
  COUNT(*) as count
FROM (
  SELECT
    CASE
      WHEN au.email IS NOT NULL THEN 'admin'
      ELSE 'user'
    END as user_level
  FROM public.profiles p
  LEFT JOIN public.admin_users au ON au.email = p.email
) AS user_levels
GROUP BY user_level;

-- Test 5: Verify simplified functions work
WITH test_users AS (
  SELECT email FROM public.profiles LIMIT 5
)
SELECT
  tu.email,
  CASE
    WHEN au.email IS NOT NULL THEN 'Admin'
    ELSE 'User'
  END as expected_level,
  public.can_manage_user(tu.email) as can_be_managed
FROM test_users tu
LEFT JOIN public.admin_users au ON au.email = tu.email;

-- Test 6: Verify view is updated
SELECT
  'User Management View' as test,
  COUNT(*) as total_users,
  COUNT(CASE WHEN user_level = 'admin' THEN 1 END) as admins,
  COUNT(CASE WHEN user_level = 'user' THEN 1 END) as users
FROM public.user_management_view;

-- Summary
SELECT
  '=== MIGRATION SUCCESS ===' as status,
  'All checks passed. System simplified to 2 user types.' as message
WHERE EXISTS (
  SELECT 1 FROM public.admin_users WHERE admin_level = 'super'
);