-- Final comprehensive admin fix
-- This script ensures the is_admin() function works correctly

-- First, let's check what we have
SELECT * FROM public.admin_users;

-- Drop and recreate the is_admin function with better logic
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  current_email text;
  is_admin_user boolean;
BEGIN
  -- Get current user info
  current_user_id := auth.uid();
  current_email := LOWER(COALESCE(auth.jwt() ->> 'email', ''));

  -- Log for debugging (you can see this in Supabase logs)
  RAISE LOG 'Checking admin status for user_id: %, email: %', current_user_id, current_email;

  -- Check if user is admin by either user_id or email
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE
      (au.user_id = current_user_id)
      OR
      (au.email IS NOT NULL AND LOWER(au.email) = current_email)
  ) INTO is_admin_user;

  RAISE LOG 'Admin check result: %', is_admin_user;

  RETURN is_admin_user;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Now ensure admin@syncedupsolutions.com is in the admin_users table
-- This will insert or update the admin user
DO $$
DECLARE
  admin_email text := 'admin@syncedupsolutions.com';
  current_user_id uuid;
BEGIN
  -- Get the current user id if logged in as admin@syncedupsolutions.com
  current_user_id := auth.uid();

  -- First try to update existing record with this email
  UPDATE public.admin_users
  SET user_id = COALESCE(user_id, current_user_id)
  WHERE LOWER(email) = LOWER(admin_email);

  -- If no rows were updated, insert a new record
  IF NOT FOUND THEN
    INSERT INTO public.admin_users (id, user_id, email, created_at, created_by)
    VALUES (
      gen_random_uuid(),
      current_user_id,
      admin_email,
      NOW(),
      current_user_id
    )
    ON CONFLICT (email) DO UPDATE
    SET user_id = COALESCE(EXCLUDED.user_id, public.admin_users.user_id);
  END IF;
END $$;

-- Test the function
SELECT public.is_admin() as is_admin_status;

-- Show current user info for debugging
SELECT
  auth.uid() as current_user_id,
  auth.jwt() ->> 'email' as current_email,
  public.is_admin() as is_admin;

-- Show all admin users
SELECT * FROM public.admin_users ORDER BY created_at DESC;