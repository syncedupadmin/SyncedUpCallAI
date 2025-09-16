-- Add 3-tier user level system for proper portal routing
-- This migration adds admin_level field to distinguish between operators and super admins

-- 1. Add admin_level column to admin_users table
ALTER TABLE public.admin_users
ADD COLUMN IF NOT EXISTS admin_level TEXT DEFAULT 'operator'
CHECK (admin_level IN ('operator', 'super'));

-- 2. Create function to get user's access level
CREATE OR REPLACE FUNCTION public.get_user_level()
RETURNS TEXT AS $$
DECLARE
  current_user_email TEXT;
  user_level TEXT;
BEGIN
  -- Get the current authenticated user's email
  SELECT email INTO current_user_email
  FROM auth.users
  WHERE id = auth.uid();

  -- If no authenticated user, return 'none'
  IF current_user_email IS NULL THEN
    RETURN 'none';
  END IF;

  -- Check if user is in admin_users table and get their level
  SELECT admin_level INTO user_level
  FROM public.admin_users
  WHERE email = current_user_email;

  -- If found in admin_users, return their level
  IF user_level IS NOT NULL THEN
    IF user_level = 'super' THEN
      RETURN 'super_admin';
    ELSE
      RETURN 'admin';
    END IF;
  END IF;

  -- Check if user has admin role in profiles (legacy support)
  SELECT role INTO user_level
  FROM public.profiles
  WHERE email = current_user_email;

  IF user_level = 'admin' THEN
    -- Legacy admin users default to operator level
    RETURN 'admin';
  END IF;

  -- Default to regular user
  RETURN 'user';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update existing is_admin function to work with levels
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  level TEXT;
BEGIN
  level := public.get_user_level();
  RETURN level IN ('admin', 'super_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.get_user_level() = 'super_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin TO authenticated;

-- 6. Set admin@syncedupsolutions.com as super admin
UPDATE public.admin_users
SET admin_level = 'super'
WHERE email = 'admin@syncedupsolutions.com';

-- 7. Ensure admin@syncedupsolutions.com exists in admin_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE email = 'admin@syncedupsolutions.com'
  ) THEN
    INSERT INTO public.admin_users (email, admin_level, user_id)
    VALUES (
      'admin@syncedupsolutions.com',
      'super',
      (SELECT id FROM auth.users WHERE email = 'admin@syncedupsolutions.com')
    );
  END IF;
END $$;

-- 8. Add helper function to promote/demote admins
CREATE OR REPLACE FUNCTION public.set_admin_level(user_email TEXT, new_level TEXT)
RETURNS VOID AS $$
BEGIN
  -- Validate level
  IF new_level NOT IN ('operator', 'super', 'remove') THEN
    RAISE EXCEPTION 'Invalid admin level. Must be operator, super, or remove';
  END IF;

  -- Only super admins can change admin levels
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can change admin levels';
  END IF;

  IF new_level = 'remove' THEN
    -- Remove from admin_users
    DELETE FROM public.admin_users WHERE email = user_email;
    -- Update profile role
    UPDATE public.profiles SET role = 'user' WHERE email = user_email;
  ELSE
    -- Insert or update in admin_users
    INSERT INTO public.admin_users (email, admin_level, user_id)
    VALUES (
      user_email,
      new_level,
      (SELECT id FROM auth.users WHERE email = user_email)
    )
    ON CONFLICT (email) DO UPDATE
    SET admin_level = new_level;

    -- Update profile role
    UPDATE public.profiles SET role = 'admin' WHERE email = user_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute only to authenticated users (function checks internally for super admin)
GRANT EXECUTE ON FUNCTION public.set_admin_level TO authenticated;

-- Example usage:
-- To make someone an operator admin: SELECT public.set_admin_level('user@example.com', 'operator');
-- To make someone a super admin: SELECT public.set_admin_level('user@example.com', 'super');
-- To remove admin access: SELECT public.set_admin_level('user@example.com', 'remove');