-- Create RPC function to update agency product_type
-- Only super admins can update product type

CREATE OR REPLACE FUNCTION public.update_agency_product_type(
  p_agency_id uuid,
  p_product_type text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super_admin boolean;
  v_agency_name text;
BEGIN
  -- Check if user is super admin
  v_is_super_admin := public.is_super_admin();

  IF NOT v_is_super_admin THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only super admins can update product type'
    );
  END IF;

  -- Validate product_type
  IF p_product_type NOT IN ('full', 'compliance_only') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid product_type. Must be "full" or "compliance_only"'
    );
  END IF;

  -- Check if agency exists
  SELECT name INTO v_agency_name
  FROM public.agencies
  WHERE id = p_agency_id;

  IF v_agency_name IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Agency not found'
    );
  END IF;

  -- Update the agency product type
  UPDATE public.agencies
  SET
    product_type = p_product_type,
    updated_at = now()
  WHERE id = p_agency_id;

  RETURN json_build_object(
    'success', true,
    'agency_name', v_agency_name,
    'new_product_type', p_product_type
  );
END;
$$;

-- Grant execute permission to authenticated users (will be checked within function)
GRANT EXECUTE ON FUNCTION public.update_agency_product_type(uuid, text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.update_agency_product_type IS
  'Updates the product type for an agency. Only super admins can use this function.';