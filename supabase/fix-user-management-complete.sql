-- Complete Fix for User Management System
-- Run this in Supabase SQL Editor to fix all user management issues

-- ============================================
-- STEP 1: Fix Profiles Table Schema
-- ============================================

-- Add missing phone column to profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN phone TEXT;
    RAISE NOTICE 'Added phone column to profiles table';
  END IF;
END $$;

-- Ensure profiles table has proper structure
ALTER TABLE public.profiles
  ALTER COLUMN email TYPE TEXT,
  ALTER COLUMN name TYPE TEXT,
  ALTER COLUMN role SET DEFAULT 'user';

-- ============================================
-- STEP 2: Ensure Admin Users Table Exists
-- ============================================

CREATE TABLE IF NOT EXISTS public.admin_users (
  email TEXT PRIMARY KEY,
  admin_level TEXT CHECK (admin_level IN ('super', 'operator')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_admin_users_level ON public.admin_users(admin_level);
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);

-- ============================================
-- STEP 3: Set Up admin@syncedupsolutions.com as Super Admin
-- ============================================

DO $$
DECLARE
  v_user_id uuid;
  v_email TEXT := 'admin@syncedupsolutions.com';
BEGIN
  -- Get the user ID
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE NOTICE '⚠️ User % not found in auth.users. They need to sign up first.', v_email;
  ELSE
    RAISE NOTICE '✅ Found user % with ID: %', v_email, v_user_id;

    -- Ensure profile exists
    INSERT INTO public.profiles (id, email, name, phone, role, created_at, updated_at)
    VALUES (
      v_user_id,
      v_email,
      'Super Administrator',
      NULL,
      'admin',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = v_email,
      name = COALESCE(profiles.name, 'Super Administrator'),
      role = 'admin',
      updated_at = NOW();

    -- Grant super admin privileges
    INSERT INTO public.admin_users (email, admin_level, user_id, created_at)
    VALUES (v_email, 'super', v_user_id, NOW())
    ON CONFLICT (email) DO UPDATE
    SET
      admin_level = 'super',
      user_id = v_user_id;

    -- Update user metadata
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{is_admin}',
      'true'::jsonb
    )
    WHERE id = v_user_id;

    RAISE NOTICE '✅ Super admin privileges granted to %', v_email;
  END IF;
END $$;

-- ============================================
-- STEP 4: Create/Update Required Functions
-- ============================================

-- Function: get_user_level (returns current user's level)
CREATE OR REPLACE FUNCTION public.get_user_level()
RETURNS TEXT AS $$
DECLARE
  user_email TEXT;
  user_level TEXT;
BEGIN
  -- Get current user's email
  user_email := auth.jwt() ->> 'email';

  IF user_email IS NULL THEN
    RETURN 'user';
  END IF;

  -- Check admin_users table first
  SELECT admin_level INTO user_level
  FROM public.admin_users
  WHERE email = user_email;

  IF user_level = 'super' THEN
    RETURN 'super_admin';
  ELSIF user_level = 'operator' THEN
    RETURN 'admin';
  END IF;

  -- Check profiles table
  SELECT role INTO user_level
  FROM public.profiles
  WHERE email = user_email;

  IF user_level = 'admin' THEN
    RETURN 'admin';
  END IF;

  RETURN 'user';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: is_admin (check if current user is any kind of admin)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.get_user_level() IN ('super_admin', 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: get_users_by_level_v2 (for the UI)
CREATE OR REPLACE FUNCTION public.get_users_by_level_v2(level TEXT DEFAULT 'all')
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  phone text,
  role text,
  user_level text,
  created_at timestamptz,
  last_sign_in_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(p.id, u.id) as id,
    COALESCE(p.email, u.email) as email,
    p.name,
    p.phone,
    COALESCE(p.role, 'user') as role,
    CASE
      WHEN au.admin_level = 'super' THEN 'super_admin'
      WHEN au.admin_level = 'operator' THEN 'admin'
      WHEN p.role = 'admin' THEN 'admin'
      ELSE 'user'
    END as user_level,
    COALESCE(p.created_at, u.created_at) as created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id OR p.email = u.email
  LEFT JOIN public.admin_users au ON au.email = u.email OR au.email = p.email
  WHERE
    CASE
      WHEN level = 'super' THEN au.admin_level = 'super'
      WHEN level = 'admin' THEN au.admin_level = 'operator'
      WHEN level = 'user' THEN (au.admin_level IS NULL OR au.admin_level = '')
      ELSE true
    END
  ORDER BY
    CASE
      WHEN au.admin_level = 'super' THEN 1
      WHEN au.admin_level = 'operator' THEN 2
      WHEN p.role = 'admin' THEN 3
      ELSE 4
    END,
    COALESCE(p.created_at, u.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: create_agent_user (for creating new users)
CREATE OR REPLACE FUNCTION public.create_agent_user(
  agent_email TEXT,
  agent_name TEXT,
  agent_phone TEXT DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  existing_user_id uuid;
  new_profile_id uuid;
  result json;
  current_user_level TEXT;
BEGIN
  -- Get current user's level
  current_user_level := public.get_user_level();

  -- Only admins can create users
  IF current_user_level NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Only admins can create user accounts';
  END IF;

  -- Check if email already exists in auth.users
  SELECT id INTO existing_user_id
  FROM auth.users
  WHERE email = agent_email;

  IF existing_user_id IS NOT NULL THEN
    -- User exists, update/create profile
    INSERT INTO public.profiles (id, email, name, phone, role, created_at, updated_at)
    VALUES (existing_user_id, agent_email, agent_name, agent_phone, 'user', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      name = COALESCE(EXCLUDED.name, profiles.name),
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      updated_at = NOW()
    RETURNING id INTO new_profile_id;

    result := json_build_object(
      'success', true,
      'profile_id', new_profile_id,
      'message', 'Profile updated for existing user',
      'user_exists', true
    );
  ELSE
    -- Create profile without ID (user needs to sign up)
    -- First check if profile with this email already exists
    SELECT id INTO new_profile_id
    FROM public.profiles
    WHERE email = agent_email;

    IF new_profile_id IS NULL THEN
      -- Create new profile entry
      INSERT INTO public.profiles (email, name, phone, role, created_at, updated_at)
      VALUES (agent_email, agent_name, agent_phone, 'user', NOW(), NOW())
      ON CONFLICT (email) DO UPDATE
      SET
        name = COALESCE(EXCLUDED.name, profiles.name),
        phone = COALESCE(EXCLUDED.phone, profiles.phone),
        updated_at = NOW()
      RETURNING id INTO new_profile_id;
    ELSE
      -- Update existing profile
      UPDATE public.profiles
      SET
        name = COALESCE(agent_name, name),
        phone = COALESCE(agent_phone, phone),
        updated_at = NOW()
      WHERE email = agent_email;
    END IF;

    result := json_build_object(
      'success', true,
      'message', 'Profile created. User needs to sign up with this email to activate account.',
      'user_exists', false,
      'signup_required', true
    );
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: set_admin_level (for promoting/demoting users)
CREATE OR REPLACE FUNCTION public.set_admin_level(user_email TEXT, new_level TEXT)
RETURNS VOID AS $$
DECLARE
  current_user_level TEXT;
  target_user_id uuid;
BEGIN
  -- Validate level
  IF new_level NOT IN ('operator', 'super', 'remove') THEN
    RAISE EXCEPTION 'Invalid admin level. Must be operator, super, or remove';
  END IF;

  -- Get current user's level
  current_user_level := public.get_user_level();

  -- Only super admins can change admin levels
  IF current_user_level != 'super_admin' THEN
    RAISE EXCEPTION 'Only super admins can modify admin levels';
  END IF;

  -- Get target user ID
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User % not found. They must sign up first.', user_email;
  END IF;

  -- Handle the level change
  IF new_level = 'remove' THEN
    -- Remove from admin_users
    DELETE FROM public.admin_users WHERE email = user_email;
    -- Update profile role
    UPDATE public.profiles SET role = 'user' WHERE email = user_email OR id = target_user_id;
  ELSE
    -- Insert or update in admin_users
    INSERT INTO public.admin_users (email, admin_level, user_id)
    VALUES (user_email, new_level, target_user_id)
    ON CONFLICT (email) DO UPDATE
    SET admin_level = new_level, user_id = target_user_id;

    -- Update profile role
    UPDATE public.profiles SET role = 'admin' WHERE email = user_email OR id = target_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 5: Grant Permissions
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_user_level TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_by_level_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_level TO authenticated;

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.admin_users TO authenticated;

-- ============================================
-- STEP 6: Verification
-- ============================================

DO $$
DECLARE
  v_count integer;
  v_level text;
BEGIN
  RAISE NOTICE '====================================';
  RAISE NOTICE 'VERIFICATION RESULTS:';
  RAISE NOTICE '====================================';

  -- Check admin@syncedupsolutions.com status
  SELECT admin_level INTO v_level
  FROM public.admin_users
  WHERE email = 'admin@syncedupsolutions.com';

  IF v_level = 'super' THEN
    RAISE NOTICE '✅ admin@syncedupsolutions.com is a SUPER ADMIN';
  ELSE
    RAISE WARNING '⚠️ admin@syncedupsolutions.com is NOT a super admin (level: %)', COALESCE(v_level, 'none');
  END IF;

  -- Count total admins
  SELECT COUNT(*) INTO v_count FROM public.admin_users WHERE admin_level = 'super';
  RAISE NOTICE '📊 Total Super Admins: %', v_count;

  SELECT COUNT(*) INTO v_count FROM public.admin_users WHERE admin_level = 'operator';
  RAISE NOTICE '📊 Total Operator Admins: %', v_count;

  SELECT COUNT(*) INTO v_count FROM public.profiles;
  RAISE NOTICE '📊 Total Profiles: %', v_count;

  RAISE NOTICE '====================================';
END $$;

-- Show all admin users
SELECT
  au.email,
  au.admin_level,
  p.name,
  p.phone,
  u.last_sign_in_at,
  CASE
    WHEN au.admin_level = 'super' THEN '👑 Super Admin'
    WHEN au.admin_level = 'operator' THEN '🛡️ Operator Admin'
  END as role_display
FROM public.admin_users au
LEFT JOIN public.profiles p ON p.email = au.email
LEFT JOIN auth.users u ON u.email = au.email
ORDER BY
  CASE au.admin_level
    WHEN 'super' THEN 1
    WHEN 'operator' THEN 2
  END;

-- ============================================
-- INSTRUCTIONS
-- ============================================
-- 1. Copy this entire script
-- 2. Go to Supabase SQL Editor
-- 3. Paste and run the script
-- 4. Check the output for verification results
-- 5. Visit https://synced-up-call-ai.vercel.app/admin/super/users
-- 6. You should now be able to create users properly