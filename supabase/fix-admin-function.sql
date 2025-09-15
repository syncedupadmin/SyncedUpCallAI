-- Fix for is_admin() function
-- The issue: function expects user_email parameter but all code calls it without parameters
-- Solution: Modify function to automatically get current user's email from auth context

-- Create new is_admin function that gets current user automatically
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  current_user_email TEXT;
BEGIN
  -- Get the current authenticated user's email
  SELECT email INTO current_user_email
  FROM auth.users
  WHERE id = auth.uid();

  -- If no authenticated user, return false
  IF current_user_email IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if email exists in admin_users table OR has admin role in profiles
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE email = current_user_email
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE email = current_user_email AND role = 'admin'
  ) OR current_user_email = 'admin@syncedupsolutions.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;

-- Also create the old version for backwards compatibility if needed
CREATE OR REPLACE FUNCTION public.is_admin(user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- If no email provided, use current user
  IF user_email IS NULL THEN
    RETURN public.is_admin();
  END IF;

  -- Check if email exists in admin_users table OR has admin role in profiles
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE email = user_email
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE email = user_email AND role = 'admin'
  ) OR user_email = 'admin@syncedupsolutions.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure admin@syncedupsolutions.com is added to admin_users table
-- This will create the record if it doesn't exist
DO $$
BEGIN
  -- Only insert if not already exists
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE email = 'admin@syncedupsolutions.com'
  ) THEN
    INSERT INTO public.admin_users (email, user_id, created_by)
    VALUES (
      'admin@syncedupsolutions.com',
      (SELECT id FROM auth.users WHERE email = 'admin@syncedupsolutions.com'),
      (SELECT id FROM auth.users WHERE email = 'admin@syncedupsolutions.com')
    );
  END IF;
END $$;

-- Also ensure the profile has admin role
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'admin@syncedupsolutions.com' AND role != 'admin';