-- Create get_my_office_memberships function
-- This is a wrapper around get_user_offices for the current user
-- Note: office_id is returned as bigint for compatibility with the frontend
CREATE OR REPLACE FUNCTION public.get_my_office_memberships()
RETURNS TABLE (
  office_id bigint,
  office_name text,
  role text,
  joined_at timestamptz
) AS $$
BEGIN
  -- For super admins, return a default office membership
  IF EXISTS (
    SELECT 1 FROM super_admin_users
    WHERE user_id = auth.uid()
  ) THEN
    RETURN QUERY
    SELECT
      1::bigint as office_id,
      'Default Office'::text as office_name,
      'admin'::text as role,
      NOW() as joined_at;
    RETURN;
  END IF;

  -- For regular users, check user_offices table
  -- Since office_id is UUID in the table but the frontend expects bigint,
  -- we'll use a hash or sequential number
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY ou.created_at)::bigint as office_id,
    o.name as office_name,
    ou.role::text,
    ou.created_at as joined_at
  FROM user_offices ou
  JOIN offices o ON o.id = ou.office_id
  WHERE ou.user_id = auth.uid();

  -- If no memberships found, return empty set
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_office_memberships TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_my_office_memberships IS 'Returns the office memberships for the currently authenticated user';