-- FIX FOR CREATING NEW AGENCIES WITH PRODUCT_TYPE
-- This ensures the create_agency_with_owner function properly accepts and saves product_type

-- 1. First, drop the old function that doesn't accept product_type
DROP FUNCTION IF EXISTS public.create_agency_with_owner(text);
DROP FUNCTION IF EXISTS public.create_agency_with_owner(text, text);

-- 2. Create the updated function with product_type parameter
CREATE OR REPLACE FUNCTION public.create_agency_with_owner(
  p_name text,
  p_product_type text DEFAULT 'full'
)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency public.agencies;
  v_slug   text;
BEGIN
  -- Validate product_type
  IF p_product_type IS NULL THEN
    p_product_type := 'full';
  END IF;

  IF p_product_type NOT IN ('full', 'compliance_only') THEN
    RAISE EXCEPTION 'Invalid product_type: %. Must be "full" or "compliance_only"', p_product_type;
  END IF;

  -- Generate a unique slug from the name
  v_slug := public.next_unique_slug(public.slugify(p_name));

  -- Insert the new agency with auto-generated slug, product type, and current user as owner
  INSERT INTO public.agencies(
    name,
    slug,
    owner_user_id,
    product_type,
    created_at,
    updated_at
  )
  VALUES (
    p_name,
    v_slug,
    auth.uid(),
    p_product_type::text,  -- Explicitly cast to text
    now(),
    now()
  )
  RETURNING * INTO v_agency;

  -- Log the creation for debugging
  RAISE LOG 'Created agency % with product_type % by user %', v_agency.name, v_agency.product_type, auth.uid();

  RETURN v_agency;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error creating agency: %', SQLERRM;
    RAISE;
END;
$$;

-- 3. Grant execute permission
REVOKE ALL ON FUNCTION public.create_agency_with_owner(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_agency_with_owner(text, text) TO authenticated, service_role;

-- 4. Ensure the agencies table has proper INSERT policy for authenticated users
DROP POLICY IF EXISTS "agencies_insert_authenticated" ON public.agencies;
CREATE POLICY "agencies_insert_authenticated"
ON public.agencies
FOR INSERT
TO authenticated
WITH CHECK (
  owner_user_id = auth.uid()  -- Users can only create agencies they own
);

-- 5. Add comment
COMMENT ON FUNCTION public.create_agency_with_owner IS
  'Creates a new agency with the current user as owner. Automatically generates a unique slug from the name. Accepts product_type parameter (full or compliance_only).';

-- 6. Verification query (run manually to test)
-- SELECT public.create_agency_with_owner('Test Agency', 'compliance_only');

-- 7. Also ensure the product_type column has a proper default
ALTER TABLE public.agencies
ALTER COLUMN product_type SET DEFAULT 'full';

-- 8. Success message
DO $$
BEGIN
  RAISE NOTICE 'create_agency_with_owner function updated successfully! New agencies can now be created with product_type.';
END$$;