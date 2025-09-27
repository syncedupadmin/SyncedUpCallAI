-- Fix user_agencies RLS policy to properly scope by agency_id
--
-- ISSUE: Current policy shows ALL user_agencies rows if user is admin of ANY agency
-- FIX: Only show user_agencies rows for agencies where user is actually admin/owner
--
-- Date: 2025-09-27

-- Drop existing problematic policy
DROP POLICY IF EXISTS user_agencies_read ON user_agencies;

-- Create corrected policy with proper agency scoping
CREATE POLICY user_agencies_read ON user_agencies
  FOR SELECT
  TO authenticated
  USING (
    -- Users can see their own memberships
    user_id = auth.uid()

    OR

    -- Users can see all members of agencies where they are admin/owner
    EXISTS (
      SELECT 1 FROM user_agencies ua
      WHERE ua.agency_id = user_agencies.agency_id  -- CRITICAL: Same agency check
        AND ua.user_id = auth.uid()
        AND ua.role IN ('admin', 'owner')
    )

    OR

    -- Super admins see everything
    is_super_admin()
  );

-- Test the fix with a query
-- Expected: Only shows members of agencies where current user is admin/owner
-- SELECT * FROM user_agencies;