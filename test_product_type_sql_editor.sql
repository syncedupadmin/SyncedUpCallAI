-- TEST VERSION FOR SQL EDITOR ONLY
-- This bypasses auth to test the product_type functionality

-- First, check that the function now accepts 2 parameters
SELECT
  proname as function_name,
  pronargs as num_parameters
FROM pg_proc
WHERE proname = 'create_agency_with_owner';
-- Should show num_parameters = 2 ✅

-- Test by directly inserting (bypasses auth requirement)
INSERT INTO public.agencies(
  name,
  slug,
  owner_user_id,
  product_type,
  created_at,
  updated_at
)
VALUES (
  'Test Compliance Agency SQL',
  'test-compliance-sql-' || substr(gen_random_uuid()::text, 1, 8),
  (SELECT id FROM auth.users LIMIT 1),  -- Use any existing user
  'compliance_only',  -- THE KEY TEST!
  now(),
  now()
)
RETURNING id, name, product_type;

-- Verify it saved correctly
SELECT id, name, product_type
FROM public.agencies
WHERE name = 'Test Compliance Agency SQL';
-- Should show product_type = 'compliance_only' ✅

-- Clean up test data (optional)
-- DELETE FROM public.agencies WHERE name = 'Test Compliance Agency SQL';