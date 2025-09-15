-- Fix the is_admin() function to work without parameters
-- This function will check if the current authenticated user is an admin

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user exists in admin_users table by user_id or email
  RETURN EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE
      -- First check by user_id
      au.user_id = auth.uid()
      OR
      -- Fallback to email check (case-insensitive)
      (
        au.email IS NOT NULL
        AND LOWER(au.email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
      )
  );
END;
$$;

-- Verify the admin user exists
SELECT * FROM public.admin_users;

-- Test the function after updating
SELECT public.is_admin() as is_admin;

-- Also check current user details
SELECT
  auth.uid() as current_user_id,
  auth.jwt() ->> 'email' as jwt_email;