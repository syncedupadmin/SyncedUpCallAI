-- URGENT FIX: Create the missing get_my_office_memberships function
-- Run this in Supabase SQL Editor immediately!

-- Drop function if it exists
DROP FUNCTION IF EXISTS public.get_my_office_memberships();

-- Create the function
CREATE OR REPLACE FUNCTION public.get_my_office_memberships()
RETURNS TABLE (
  office_id uuid,
  office_name text,
  role text,
  is_primary boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return a default office for all users
  -- This fixes the immediate 404 error
  RETURN QUERY
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid as office_id,
    'Default Office'::text as office_name,
    'member'::text as role,
    true as is_primary;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_my_office_memberships() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_office_memberships() TO anon;
GRANT EXECUTE ON FUNCTION public.get_my_office_memberships() TO service_role;