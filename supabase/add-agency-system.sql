-- =====================================================
-- ADD AGENCY/OFFICE SYSTEM
-- =====================================================
-- Creates offices and user_offices tables for multi-agency support

-- =====================================================
-- STEP 1: Create offices table (agencies)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.offices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Add RLS
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;

-- Create policy: admins can view all offices
CREATE POLICY "Admins can view all offices" ON public.offices
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Create policy: super admins can manage offices
CREATE POLICY "Super admins can manage offices" ON public.offices
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- =====================================================
-- STEP 2: Create user_offices junction table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_offices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'agent')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, office_id)
);

-- Add RLS
ALTER TABLE public.user_offices ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own office memberships" ON public.user_offices
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all office memberships" ON public.user_offices
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Super admins can manage all office memberships" ON public.user_offices
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Agency admins can manage their office members" ON public.user_offices
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_offices uo
      WHERE uo.user_id = auth.uid()
      AND uo.office_id = user_offices.office_id
      AND uo.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_offices uo
      WHERE uo.user_id = auth.uid()
      AND uo.office_id = user_offices.office_id
      AND uo.role = 'admin'
    )
  );

-- =====================================================
-- STEP 3: Add office_id to related tables
-- =====================================================

-- Add office_id to calls table for multi-tenancy
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS office_id uuid REFERENCES public.offices(id);

-- Add office_id to profiles for default office
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS default_office_id uuid REFERENCES public.offices(id);

-- =====================================================
-- STEP 4: Create helper functions
-- =====================================================

-- Function to get user's offices
CREATE OR REPLACE FUNCTION public.get_user_offices(target_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  office_id uuid,
  office_name text,
  user_role text,
  joined_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id as office_id,
    o.name as office_name,
    uo.role as user_role,
    uo.created_at as joined_at
  FROM public.user_offices uo
  JOIN public.offices o ON o.id = uo.office_id
  WHERE uo.user_id = COALESCE(target_user_id, auth.uid())
  ORDER BY o.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user belongs to office
CREATE OR REPLACE FUNCTION public.user_belongs_to_office(
  target_user_id uuid,
  target_office_id uuid
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_offices
    WHERE user_id = target_user_id
    AND office_id = target_office_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is agency admin
CREATE OR REPLACE FUNCTION public.is_agency_admin(
  target_office_id uuid DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Super admins are always agency admins
  IF public.is_super_admin() THEN
    RETURN true;
  END IF;

  -- Check if user is admin of specific office or any office
  IF target_office_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_offices
      WHERE user_id = auth.uid()
      AND office_id = target_office_id
      AND role = 'admin'
    );
  ELSE
    RETURN EXISTS (
      SELECT 1 FROM public.user_offices
      WHERE user_id = auth.uid()
      AND role = 'admin'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_users_by_level to include office filtering
CREATE OR REPLACE FUNCTION public.get_users_by_level_with_office(
  level_filter TEXT DEFAULT 'all',
  office_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  phone text,
  role text,
  user_level text,
  office_id uuid,
  office_name text,
  office_role text,
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
      WHEN au.email IS NOT NULL THEN 'super_admin'
      WHEN uo.role = 'admin' THEN 'agency_admin'
      WHEN uo.role = 'agent' THEN 'agent'
      ELSE 'user'
    END as user_level,
    o.id as office_id,
    o.name as office_name,
    uo.role as office_role,
    p.created_at,
    u.last_sign_in_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.admin_users au ON au.email = p.email
  LEFT JOIN public.user_offices uo ON uo.user_id = p.id
  LEFT JOIN public.offices o ON o.id = uo.office_id
  WHERE
    -- Filter by office if specified
    (office_filter IS NULL OR uo.office_id = office_filter)
    AND
    -- Filter by user level
    CASE
      WHEN level_filter = 'super_admin' THEN au.email IS NOT NULL
      WHEN level_filter = 'agency_admin' THEN uo.role = 'admin'
      WHEN level_filter = 'agent' THEN uo.role = 'agent'
      WHEN level_filter = 'user' THEN (au.email IS NULL AND uo.id IS NULL)
      ELSE true
    END
  ORDER BY
    CASE
      WHEN au.email IS NOT NULL THEN 1
      WHEN uo.role = 'admin' THEN 2
      WHEN uo.role = 'agent' THEN 3
      ELSE 4
    END,
    p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to assign user to office
CREATE OR REPLACE FUNCTION public.assign_user_to_office(
  target_user_id uuid,
  target_office_id uuid,
  target_role text DEFAULT 'agent'
)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  -- Check permissions
  IF NOT public.is_super_admin() AND NOT public.is_agency_admin(target_office_id) THEN
    RAISE EXCEPTION 'Insufficient permissions to assign users to this office';
  END IF;

  -- Validate role
  IF target_role NOT IN ('admin', 'agent') THEN
    RAISE EXCEPTION 'Invalid role. Must be admin or agent';
  END IF;

  -- Insert or update membership
  INSERT INTO public.user_offices (user_id, office_id, role)
  VALUES (target_user_id, target_office_id, target_role)
  ON CONFLICT (user_id, office_id) DO UPDATE
  SET role = EXCLUDED.role, updated_at = now();

  result := json_build_object(
    'success', true,
    'message', 'User assigned to office successfully'
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create office
CREATE OR REPLACE FUNCTION public.create_office(
  office_name text
)
RETURNS json AS $$
DECLARE
  new_office_id uuid;
  result json;
BEGIN
  -- Only super admins can create offices
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can create offices';
  END IF;

  -- Create the office
  INSERT INTO public.offices (name)
  VALUES (office_name)
  RETURNING id INTO new_office_id;

  result := json_build_object(
    'success', true,
    'office_id', new_office_id,
    'message', 'Office created successfully'
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STEP 5: Grant permissions
-- =====================================================

GRANT ALL ON public.offices TO authenticated;
GRANT ALL ON public.user_offices TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_offices TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_office TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_agency_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_by_level_with_office TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_to_office TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_office TO authenticated;

-- =====================================================
-- STEP 6: Insert default office for existing users
-- =====================================================

DO $$
DECLARE
  default_office_id uuid;
BEGIN
  -- Create a default office if none exist
  IF NOT EXISTS (SELECT 1 FROM public.offices) THEN
    INSERT INTO public.offices (name)
    VALUES ('Main Office')
    RETURNING id INTO default_office_id;

    -- Assign all existing admin users to the default office as admins
    INSERT INTO public.user_offices (user_id, office_id, role)
    SELECT
      u.id,
      default_office_id,
      'admin'
    FROM auth.users u
    JOIN public.admin_users au ON au.email = u.email
    ON CONFLICT DO NOTHING;

    -- Assign all non-admin users to the default office as agents
    INSERT INTO public.user_offices (user_id, office_id, role)
    SELECT
      u.id,
      default_office_id,
      'agent'
    FROM auth.users u
    WHERE u.email NOT IN (SELECT email FROM public.admin_users)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ Created default office and migrated users';
  END IF;
END $$;

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
  office_count INTEGER;
  membership_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO office_count FROM public.offices;
  SELECT COUNT(*) INTO membership_count FROM public.user_offices;

  RAISE NOTICE '✅ Agency System Setup Complete!';
  RAISE NOTICE '   Offices: %', office_count;
  RAISE NOTICE '   User Memberships: %', membership_count;
END $$;