-- Update create_agency_with_owner RPC function to accept product_type parameter

-- Drop existing function
DROP FUNCTION IF EXISTS public.create_agency_with_owner(text);

-- Create updated function with product_type parameter
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
  IF p_product_type NOT IN ('full', 'compliance_only') THEN
    RAISE EXCEPTION 'Invalid product_type. Must be "full" or "compliance_only"';
  END IF;

  -- Generate a unique slug from the name
  v_slug := public.next_unique_slug(public.slugify(p_name));

  -- Insert the new agency with auto-generated slug, product type, and current user as owner
  INSERT INTO public.agencies(name, slug, owner_user_id, product_type, created_at, updated_at)
  VALUES (
    p_name,
    v_slug,
    auth.uid(),
    p_product_type,
    now(),
    now()
  )
  RETURNING * INTO v_agency;

  RETURN v_agency;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_agency_with_owner(text, text) TO authenticated;

-- Update comment
COMMENT ON FUNCTION public.create_agency_with_owner IS
  'Creates a new agency with the current user as owner. Automatically generates a unique slug from the name. If slug exists, appends -2, -3, etc. Accepts product_type (full or compliance_only).';
