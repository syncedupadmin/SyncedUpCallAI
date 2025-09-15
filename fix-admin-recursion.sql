-- CRITICAL FIX: Remove recursion from is_admin() function
-- The function was calling itself causing stack overflow

DROP FUNCTION IF EXISTS public.is_admin();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE
      au.user_id = auth.uid()
      OR (
        au.email IS NOT NULL
        AND LOWER(au.email) = LOWER(COALESCE((auth.jwt() ->> 'email')::text, ''))
      )
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Ensure admin@syncedupsolutions.com is properly set up
INSERT INTO public.admin_users (id, user_id, email, created_at, created_by)
VALUES (
  gen_random_uuid(),
  '51ed7df7-7a5b-4159-8e70-f655fb0096e2', -- Your user ID from the status
  'admin@syncedupsolutions.com',
  NOW(),
  '51ed7df7-7a5b-4159-8e70-f655fb0096e2'
)
ON CONFLICT (email) DO UPDATE
SET user_id = EXCLUDED.user_id;

-- Test the function
SELECT public.is_admin() as admin_status;

-- Verify admin users
SELECT * FROM public.admin_users;