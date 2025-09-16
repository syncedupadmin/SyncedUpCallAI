-- Ensure Super Admin Permissions for admin@syncedupsolutions.com
-- Run this in Supabase SQL Editor to grant full super admin permissions

-- 1. First, ensure the user exists in auth.users
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get the user ID for admin@syncedupsolutions.com
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'admin@syncedupsolutions.com';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User admin@syncedupsolutions.com not found in auth.users. They need to sign up first.';
  ELSE
    RAISE NOTICE 'Found user admin@syncedupsolutions.com with ID: %', v_user_id;

    -- 2. Ensure profile exists with admin role
    INSERT INTO public.profiles (id, email, name, role, created_at, updated_at)
    VALUES (
      v_user_id,
      'admin@syncedupsolutions.com',
      'Super Admin',
      'admin',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
      email = 'admin@syncedupsolutions.com',
      role = 'admin',
      updated_at = NOW();

    RAISE NOTICE 'Profile ensured for admin@syncedupsolutions.com';

    -- 3. Grant super admin level in admin_users table
    INSERT INTO public.admin_users (email, admin_level, user_id, created_at)
    VALUES (
      'admin@syncedupsolutions.com',
      'super',
      v_user_id,
      NOW()
    )
    ON CONFLICT (email) DO UPDATE
    SET
      admin_level = 'super',
      user_id = v_user_id;

    RAISE NOTICE 'Super admin level granted to admin@syncedupsolutions.com';

    -- 4. Also ensure the user metadata is set correctly
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
      COALESCE(raw_user_meta_data, '{}'::jsonb),
      '{is_admin}',
      'true'::jsonb
    )
    WHERE id = v_user_id;

    RAISE NOTICE 'User metadata updated for admin@syncedupsolutions.com';
  END IF;
END $$;

-- 5. Create or replace the get_users_by_level_v2 function that the UI is using
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
    p.id,
    p.email,
    p.name,
    p.phone,
    p.role,
    CASE
      WHEN au.admin_level = 'super' THEN 'super_admin'
      WHEN au.admin_level = 'operator' THEN 'admin'
      WHEN p.role = 'admin' THEN 'admin'
      ELSE 'user'
    END as user_level,
    p.created_at,
    u.last_sign_in_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.admin_users au ON au.email = p.email
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
    p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Ensure the create_agent_user function exists and works
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
BEGIN
  -- Check if email already exists in auth.users
  SELECT id INTO existing_user_id
  FROM auth.users
  WHERE email = agent_email;

  IF existing_user_id IS NOT NULL THEN
    -- User already exists in auth, just ensure profile exists
    INSERT INTO public.profiles (id, email, name, phone, role)
    VALUES (existing_user_id, agent_email, agent_name, agent_phone, 'user')
    ON CONFLICT (id) DO UPDATE
    SET
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
    -- User doesn't exist - create profile without ID (they'll need to sign up)
    INSERT INTO public.profiles (email, name, phone, role)
    VALUES (agent_email, agent_name, agent_phone, 'user')
    ON CONFLICT (email) DO UPDATE
    SET
      name = COALESCE(EXCLUDED.name, profiles.name),
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      updated_at = NOW();

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

-- 7. Ensure the set_admin_level function works properly
CREATE OR REPLACE FUNCTION public.set_admin_level(user_email TEXT, new_level TEXT)
RETURNS VOID AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Validate level
  IF new_level NOT IN ('operator', 'super', 'remove') THEN
    RAISE EXCEPTION 'Invalid admin level. Must be operator, super, or remove';
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
    UPDATE public.profiles SET role = 'user' WHERE email = user_email;
  ELSE
    -- Insert or update in admin_users
    INSERT INTO public.admin_users (email, admin_level, user_id)
    VALUES (user_email, new_level, target_user_id)
    ON CONFLICT (email) DO UPDATE
    SET admin_level = new_level;

    -- Update profile role
    UPDATE public.profiles SET role = 'admin' WHERE email = user_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Grant permissions
GRANT EXECUTE ON FUNCTION public.get_users_by_level_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_agent_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_level TO authenticated;

-- 9. Verify the setup
DO $$
DECLARE
  v_count integer;
BEGIN
  -- Check if admin@syncedupsolutions.com is in admin_users
  SELECT COUNT(*) INTO v_count
  FROM public.admin_users
  WHERE email = 'admin@syncedupsolutions.com' AND admin_level = 'super';

  IF v_count > 0 THEN
    RAISE NOTICE '✅ SUCCESS: admin@syncedupsolutions.com is configured as a super admin';
  ELSE
    RAISE WARNING '⚠️ WARNING: admin@syncedupsolutions.com is NOT configured as a super admin';
  END IF;

  -- Check if profile exists
  SELECT COUNT(*) INTO v_count
  FROM public.profiles
  WHERE email = 'admin@syncedupsolutions.com';

  IF v_count > 0 THEN
    RAISE NOTICE '✅ Profile exists for admin@syncedupsolutions.com';
  ELSE
    RAISE WARNING '⚠️ Profile does not exist for admin@syncedupsolutions.com';
  END IF;
END $$;

-- 10. Show current admin users
SELECT
  au.email,
  au.admin_level,
  p.name,
  p.role,
  u.last_sign_in_at,
  CASE
    WHEN au.admin_level = 'super' THEN '👑 Super Admin'
    WHEN au.admin_level = 'operator' THEN '🛡️ Operator Admin'
    ELSE '👤 User'
  END as access_level
FROM public.admin_users au
LEFT JOIN public.profiles p ON p.email = au.email
LEFT JOIN auth.users u ON u.email = au.email
ORDER BY
  CASE au.admin_level
    WHEN 'super' THEN 1
    WHEN 'operator' THEN 2
    ELSE 3
  END;