-- Create Admin User for stock623@gmail.com
-- Run this in Supabase SQL Editor

-- Step 1: First check if user exists in auth.users
DO $$
DECLARE
  user_id uuid;
BEGIN
  -- Check if user exists
  SELECT id INTO user_id FROM auth.users WHERE email = 'stock623@gmail.com';

  IF user_id IS NULL THEN
    RAISE NOTICE 'User does not exist in auth.users. Creating user...';

    -- Note: Direct user creation in auth.users requires service_role access
    -- For production, use Supabase Auth Admin API or have user sign up
    -- This is a workaround for development/testing

    -- Create a temporary user (you'll need to reset password via Supabase Auth)
    -- This requires admin access to Supabase
    RAISE NOTICE 'Please create user stock623@gmail.com via Supabase Dashboard Auth panel';
  ELSE
    RAISE NOTICE 'User found with ID: %', user_id;
  END IF;
END $$;

-- Step 2: Ensure profile exists
INSERT INTO public.profiles (id, email, name, role)
SELECT
  id,
  'stock623@gmail.com',
  'Stock Admin',
  'admin'
FROM auth.users
WHERE email = 'stock623@gmail.com'
ON CONFLICT (id) DO UPDATE
SET
  role = 'admin',
  name = COALESCE(profiles.name, 'Stock Admin'),
  updated_at = NOW();

-- Step 3: Grant super admin access
INSERT INTO public.admin_users (user_id, email, admin_level, created_at)
SELECT
  id,
  'stock623@gmail.com',
  'super',
  NOW()
FROM auth.users
WHERE email = 'stock623@gmail.com'
ON CONFLICT (email) DO UPDATE
SET
  admin_level = 'super',
  user_id = (SELECT id FROM auth.users WHERE email = 'stock623@gmail.com');

-- Step 4: Verify the setup
SELECT
  'User Setup Complete' as status,
  p.email,
  p.name,
  p.role as profile_role,
  au.admin_level,
  CASE
    WHEN au.admin_level = 'super' THEN 'Super Admin'
    WHEN au.admin_level = 'operator' THEN 'Operator'
    ELSE 'Regular Admin'
  END as access_level
FROM public.profiles p
LEFT JOIN public.admin_users au ON au.email = p.email
WHERE p.email = 'stock623@gmail.com';

-- Step 5: Also fix the create_agent_user function to handle initial setup
-- When no admins exist, allow first user to become admin
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
  admin_count integer;
BEGIN
  -- Check if any admins exist
  SELECT COUNT(*) INTO admin_count FROM public.admin_users;

  -- If no admins exist and trying to create stock623@gmail.com, allow it
  IF admin_count = 0 AND agent_email = 'stock623@gmail.com' THEN
    -- Bootstrap the first admin
    INSERT INTO public.profiles (email, name, phone, role)
    VALUES (agent_email, agent_name, agent_phone, 'admin')
    ON CONFLICT (email) DO UPDATE
    SET
      name = COALESCE(EXCLUDED.name, profiles.name),
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      role = 'admin',
      updated_at = NOW()
    RETURNING id INTO new_profile_id;

    -- Make them super admin
    INSERT INTO public.admin_users (email, admin_level, user_id)
    VALUES (
      agent_email,
      'super',
      (SELECT id FROM auth.users WHERE email = agent_email)
    )
    ON CONFLICT (email) DO UPDATE
    SET admin_level = 'super';

    RETURN json_build_object(
      'success', true,
      'profile_id', new_profile_id,
      'message', 'First admin created successfully',
      'is_admin', true
    );
  END IF;

  -- Normal flow - check admin permissions
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can create agent accounts';
  END IF;

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
    -- User doesn't exist - create profile and return instructions
    INSERT INTO public.profiles (email, name, phone, role)
    VALUES (agent_email, agent_name, agent_phone, 'user')
    ON CONFLICT (email) DO UPDATE
    SET
      name = COALESCE(EXCLUDED.name, profiles.name),
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      updated_at = NOW()
    RETURNING id INTO new_profile_id;

    result := json_build_object(
      'success', true,
      'profile_id', new_profile_id,
      'message', 'Profile created. User needs to sign up with this email to activate account.',
      'user_exists', false,
      'signup_required', true
    );
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_agent_user TO anon, authenticated;