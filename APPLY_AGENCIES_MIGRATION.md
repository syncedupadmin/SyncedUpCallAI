# Apply Agencies Migration

## Quick Fix for 409 Error

The 409 Conflict error occurs because the database still has a unique constraint on the agency name. To fix this, you need to run the migration SQL.

## Option 1: Run in Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste the entire contents of: `supabase/migrations/20250109_improve_agencies_slug.sql`
4. Click "Run" to execute the migration

## Option 2: Quick Copy-Paste

Copy and run this SQL in your Supabase SQL Editor:

```sql
-- Drop unique constraint on name (allow duplicates)
ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_name_key;

-- Ensure slug has unique index
CREATE UNIQUE INDEX IF NOT EXISTS agencies_slug_key ON public.agencies(slug);

-- Create slugify function
CREATE OR REPLACE FUNCTION public.slugify(txt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(coalesce(txt, ''), '[^a-z0-9]+', '-', 'g'))
$$;

-- Create unique slug generator
CREATE OR REPLACE FUNCTION public.next_unique_slug(base_slug text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  s   text := nullif(base_slug, '');
  n   int  := 1;
  out text;
BEGIN
  IF s IS NULL THEN s := 'agency'; END IF;
  LOOP
    out := CASE WHEN n = 1 THEN s ELSE s || '-' || n END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agencies WHERE slug = out);
    n := n + 1;
  END LOOP;
  RETURN out;
END;
$$;

-- Update RPC function
CREATE OR REPLACE FUNCTION public.create_agency_with_owner(p_name text)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_agency public.agencies;
  v_slug   text;
BEGIN
  v_slug := public.next_unique_slug(public.slugify(p_name));
  INSERT INTO public.agencies(name, slug, owner_user_id, created_at, updated_at)
  VALUES (p_name, v_slug, auth.uid(), now(), now())
  RETURNING * INTO v_agency;
  RETURN v_agency;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_agency_with_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.slugify(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_unique_slug(text) TO authenticated;
```

## What This Does

- Removes the unique constraint on `name` column
- Keeps `slug` unique
- Auto-generates unique slugs: "PHS" → "phs", next "PHS" → "phs-2", etc.
- No more 409 errors when creating agencies with duplicate names

## Temporary Workaround (Already Applied)

The app now automatically adds a timestamp suffix if a duplicate is detected, so it will work even without the migration. But running the migration is the proper fix.