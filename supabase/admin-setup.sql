-- Admin Setup SQL
-- Instead of hardcoding admin emails, we'll use a proper admin management approach

-- 1. Create an admin_users table to manage admin access
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Only service role can manage admin users
CREATE POLICY "Service role only" ON public.admin_users
  FOR ALL USING (false);

-- 2. Update the handle_new_user function to check admin_users table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- Check if user email exists in admin_users table
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE email = new.email
  ) INTO is_admin;

  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    CASE
      WHEN is_admin THEN 'admin'
      ELSE COALESCE(new.raw_user_meta_data->>'role', 'user')
    END
  ) ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- 3. Function to check if a user is admin
CREATE OR REPLACE FUNCTION public.is_admin(user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE email = user_email
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE email = user_email AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to add an admin user (can only be called by service role or existing admin)
CREATE OR REPLACE FUNCTION public.add_admin_user(admin_email TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.admin_users (email, user_id, created_by)
  VALUES (
    admin_email,
    (SELECT id FROM auth.users WHERE email = admin_email),
    auth.uid()
  )
  ON CONFLICT (email) DO NOTHING;

  -- Update existing user's role if they exist
  UPDATE public.profiles
  SET role = 'admin'
  WHERE email = admin_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to remove an admin user
CREATE OR REPLACE FUNCTION public.remove_admin_user(admin_email TEXT)
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.admin_users WHERE email = admin_email;

  -- Update existing user's role to regular user
  UPDATE public.profiles
  SET role = 'user'
  WHERE email = admin_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions appropriately
REVOKE EXECUTE ON FUNCTION public.add_admin_user FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_admin_user FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;

-- To add your first admin, run this after deployment:
-- SELECT public.add_admin_user('your-admin-email@example.com');