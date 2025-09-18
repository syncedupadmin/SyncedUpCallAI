-- Create the missing get_my_office_memberships function
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
  -- For now, return a default office for all users
  -- This can be enhanced later with proper office/user relationships
  RETURN QUERY
  SELECT
    COALESCE(o.id, '00000000-0000-0000-0000-000000000001'::uuid) as office_id,
    COALESCE(o.name, 'Default Office') as office_name,
    'member'::text as role,
    true as is_primary
  FROM (SELECT 1) as dummy
  LEFT JOIN public.offices o ON o.id = '00000000-0000-0000-0000-000000000001'::uuid
  LIMIT 1;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_office_memberships() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_office_memberships() TO anon;