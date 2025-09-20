-- Improve agencies table: drop unique constraint on name, keep slug unique
-- This allows multiple agencies with same display name but unique slugs

-- 1) Drop the unique constraint on name (if it exists)
ALTER TABLE public.agencies
  DROP CONSTRAINT IF EXISTS agencies_name_key;

-- 2) Ensure slug has a unique index
CREATE UNIQUE INDEX IF NOT EXISTS agencies_slug_key
  ON public.agencies(slug);

-- 3) Create helper function to slugify text
CREATE OR REPLACE FUNCTION public.slugify(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(coalesce(txt, ''), '[^a-z0-9]+', '-', 'g'))
$$;

-- 4) Create helper function to ensure unique slug
-- If base slug is taken, append -2, -3, etc.
CREATE OR REPLACE FUNCTION public.next_unique_slug(base_slug text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  s   text := nullif(base_slug, '');
  n   int  := 1;
  out text;
BEGIN
  -- Default to 'agency' if no base slug provided
  IF s IS NULL THEN
    s := 'agency';
  END IF;

  -- Loop until we find an unused slug
  LOOP
    out := CASE WHEN n = 1 THEN s ELSE s || '-' || n END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agencies WHERE slug = out);
    n := n + 1;
  END LOOP;

  RETURN out;
END;
$$;

-- 5) Update the RPC function to auto-generate unique slugs
CREATE OR REPLACE FUNCTION public.create_agency_with_owner(p_name text)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency public.agencies;
  v_slug   text;
BEGIN
  -- Generate a unique slug from the name
  v_slug := public.next_unique_slug(public.slugify(p_name));

  -- Insert the new agency with auto-generated slug and current user as owner
  INSERT INTO public.agencies(name, slug, owner_user_id, created_at, updated_at)
  VALUES (
    p_name,
    v_slug,
    auth.uid(),
    now(),
    now()
  )
  RETURNING * INTO v_agency;

  RETURN v_agency;
END;
$$;

-- 6) Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_agency_with_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.slugify(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_unique_slug(text) TO authenticated;

-- 7) Add comment to explain the behavior
COMMENT ON FUNCTION public.create_agency_with_owner IS
  'Creates a new agency with the current user as owner. Automatically generates a unique slug from the name. If slug exists, appends -2, -3, etc.';