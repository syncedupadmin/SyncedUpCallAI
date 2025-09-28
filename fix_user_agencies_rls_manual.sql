-- Manual fix for user_agencies RLS policy
-- Run this in Supabase SQL Editor
--
-- Step 1: Drop the existing policy explicitly
DROP POLICY user_agencies_read ON user_agencies;

-- Step 2: Create the corrected policy
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

-- Step 3: Verify the policy
SELECT
  schemaname,
  tablename,
  policyname,
  qual
FROM pg_policies
WHERE tablename = 'user_agencies'
  AND policyname = 'user_agencies_read';