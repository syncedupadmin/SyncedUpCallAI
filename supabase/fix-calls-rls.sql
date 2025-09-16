-- Fix RLS for calls table
-- The issue is that RLS is enabled but the policy might not be working correctly

-- First, let's check the existing policy
SELECT * FROM pg_policies WHERE tablename = 'calls';

-- Drop existing policies on calls table to start fresh
DROP POLICY IF EXISTS "Admins can read calls" ON calls;

-- Create a more permissive policy for authenticated users
-- This allows any authenticated user to read calls
CREATE POLICY "Authenticated users can read calls"
ON calls
FOR SELECT
TO authenticated
USING (true);

-- Also create a policy for the service role (used by the API)
CREATE POLICY "Service role full access"
ON calls
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- If you want to keep admin-only access, use this instead:
-- CREATE POLICY "Admins can read calls"
-- ON calls
-- FOR SELECT
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1 FROM admin_users
--     WHERE admin_users.id = auth.uid()
--   )
--   OR
--   auth.jwt() ->> 'role' = 'service_role'
-- );

-- Verify the policies
SELECT * FROM pg_policies WHERE tablename = 'calls';