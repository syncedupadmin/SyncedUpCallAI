-- Add agency support to calls table and create RLS policies
-- This migration ensures calls are properly scoped to agencies

-- =====================================================
-- STEP 1: Add agency_id to calls table if not exists
-- =====================================================

ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id);

-- =====================================================
-- STEP 2: Create agency-based RLS policies for calls
-- =====================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view calls from their agencies" ON public.calls;
DROP POLICY IF EXISTS "Users can insert calls to their agencies" ON public.calls;
DROP POLICY IF EXISTS "Users can update calls from their agencies" ON public.calls;
DROP POLICY IF EXISTS "Admins can view all calls" ON public.calls;

-- Enable RLS on calls table
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view calls from their agencies
CREATE POLICY "Users can view calls from their agencies" ON public.calls
  FOR SELECT
  TO authenticated
  USING (
    -- Super admins can see all calls
    public.is_super_admin() OR
    -- Users can see calls from agencies they belong to
    EXISTS (
      SELECT 1 FROM public.user_agencies ua
      WHERE ua.user_id = auth.uid()
      AND ua.agency_id = calls.agency_id
    )
  );

-- Policy: Users can insert calls to their agencies
CREATE POLICY "Users can insert calls to their agencies" ON public.calls
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Super admins can insert anywhere
    public.is_super_admin() OR
    -- Users can insert calls to agencies they belong to
    EXISTS (
      SELECT 1 FROM public.user_agencies ua
      WHERE ua.user_id = auth.uid()
      AND ua.agency_id = calls.agency_id
    )
  );

-- Policy: Users can update calls from their agencies
CREATE POLICY "Users can update calls from their agencies" ON public.calls
  FOR UPDATE
  TO authenticated
  USING (
    -- Super admins can update all calls
    public.is_super_admin() OR
    -- Users can update calls from agencies they belong to
    EXISTS (
      SELECT 1 FROM public.user_agencies ua
      WHERE ua.user_id = auth.uid()
      AND ua.agency_id = calls.agency_id
    )
  );

-- =====================================================
-- STEP 3: Create function to get user's default agency
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_default_agency()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  default_agency_id uuid;
BEGIN
  -- Get the user's first agency (or the one they're an admin of)
  SELECT ua.agency_id INTO default_agency_id
  FROM public.user_agencies ua
  WHERE ua.user_id = auth.uid()
  ORDER BY
    CASE WHEN ua.role = 'admin' THEN 1 ELSE 2 END,
    ua.created_at ASC
  LIMIT 1;

  RETURN default_agency_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_default_agency() TO authenticated;

-- =====================================================
-- STEP 4: Migrate existing calls to default agency
-- =====================================================

-- Update calls that don't have an agency_id yet
-- Assign them to the first agency that exists, or create a default one

DO $$
DECLARE
  default_agency_id uuid;
  calls_updated integer;
BEGIN
  -- Get the first agency, or create a default one
  SELECT id INTO default_agency_id FROM public.agencies ORDER BY created_at ASC LIMIT 1;

  IF default_agency_id IS NULL THEN
    -- Create a default agency if none exist
    INSERT INTO public.agencies (name, slug, owner_user_id)
    SELECT
      'Default Agency',
      'default-agency',
      (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
    WHERE EXISTS (SELECT 1 FROM auth.users)
    RETURNING id INTO default_agency_id;

    RAISE NOTICE '✅ Created default agency: %', default_agency_id;
  END IF;

  -- Update calls without agency_id
  UPDATE public.calls
  SET agency_id = default_agency_id
  WHERE agency_id IS NULL;

  GET DIAGNOSTICS calls_updated = ROW_COUNT;
  RAISE NOTICE '✅ Updated % calls with default agency', calls_updated;
END $$;

-- =====================================================
-- STEP 5: Make agency_id NOT NULL after migration
-- =====================================================

-- Now that all calls have an agency_id, make it required
ALTER TABLE public.calls
ALTER COLUMN agency_id SET NOT NULL;

-- =====================================================
-- STEP 6: Create indexes for performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_calls_agency_id ON public.calls(agency_id);
CREATE INDEX IF NOT EXISTS idx_calls_agency_created_at ON public.calls(agency_id, created_at DESC);

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
  calls_count integer;
  agencies_count integer;
BEGIN
  SELECT COUNT(*) INTO calls_count FROM public.calls WHERE agency_id IS NOT NULL;
  SELECT COUNT(*) INTO agencies_count FROM public.agencies;

  RAISE NOTICE '✅ Agency Support Migration Complete!';
  RAISE NOTICE '   Calls with agency_id: %', calls_count;
  RAISE NOTICE '   Total agencies: %', agencies_count;
END $$;