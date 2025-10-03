-- QUICK FIX: Drop existing function with different return type
-- Run this BEFORE the main migration if you get return type errors

-- Drop the existing function regardless of return type
DROP FUNCTION IF EXISTS public.update_agency_product_type(uuid, text) CASCADE;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Old function dropped successfully. You can now run the main migration.';
END$$;