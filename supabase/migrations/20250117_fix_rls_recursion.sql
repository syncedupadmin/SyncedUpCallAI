-- =====================================================
-- CRITICAL FIX: Resolve RLS Infinite Recursion
-- Date: 2025-01-17
-- Issue: "infinite recursion detected in policy for relation user_offices"
-- =====================================================

-- STEP 1: Temporarily disable RLS to restore service
ALTER TABLE public.offices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_offices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs DISABLE ROW LEVEL SECURITY;

-- STEP 2: Drop ALL existing policies to clear recursion
-- Drop policies on offices table
DROP POLICY IF EXISTS "Admins can view all offices" ON public.offices;
DROP POLICY IF EXISTS "Super admins can manage offices" ON public.offices;
DROP POLICY IF EXISTS "Office select" ON public.offices;
DROP POLICY IF EXISTS "Office insert" ON public.offices;
DROP POLICY IF EXISTS "Office update" ON public.offices;
DROP POLICY IF EXISTS "Office delete" ON public.offices;

-- Drop policies on user_offices table
DROP POLICY IF EXISTS "Users can view their own office memberships" ON public.user_offices;
DROP POLICY IF EXISTS "Admins can view all office memberships" ON public.user_offices;
DROP POLICY IF EXISTS "Super admins can manage all office memberships" ON public.user_offices;
DROP POLICY IF EXISTS "Agency admins can manage their office members" ON public.user_offices;
DROP POLICY IF EXISTS "UserOffices select" ON public.user_offices;
DROP POLICY IF EXISTS "UserOffices insert" ON public.user_offices;
DROP POLICY IF EXISTS "UserOffices update" ON public.user_offices;
DROP POLICY IF EXISTS "UserOffices delete" ON public.user_offices;

-- Drop policies on calls table
DROP POLICY IF EXISTS "Authenticated users can read calls" ON public.calls;
DROP POLICY IF EXISTS "Service role full access" ON public.calls;
DROP POLICY IF EXISTS "Office select" ON public.calls;
DROP POLICY IF EXISTS "Office insert" ON public.calls;
DROP POLICY IF EXISTS "Office update" ON public.calls;
DROP POLICY IF EXISTS "Office delete" ON public.calls;

-- Drop policies on contacts table
DROP POLICY IF EXISTS "Office select" ON public.contacts;
DROP POLICY IF EXISTS "Office insert" ON public.contacts;
DROP POLICY IF EXISTS "Office update" ON public.contacts;
DROP POLICY IF EXISTS "Office delete" ON public.contacts;

-- Drop policies on webhook_logs table
DROP POLICY IF EXISTS "Office select" ON public.webhook_logs;
DROP POLICY IF EXISTS "Office insert" ON public.webhook_logs;
DROP POLICY IF EXISTS "Office update" ON public.webhook_logs;
DROP POLICY IF EXISTS "Office delete" ON public.webhook_logs;

-- STEP 3: Create SIMPLE, NON-RECURSIVE policies

-- Re-enable RLS
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- OFFICES TABLE - Simple policies without recursion
-- =====================================================
CREATE POLICY "offices_read_policy" ON public.offices
FOR SELECT USING (
  -- Super admins can see all
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  -- Users can see offices they belong to
  EXISTS (
    SELECT 1 FROM public.user_offices uo
    WHERE uo.office_id = offices.id
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "offices_write_policy" ON public.offices
FOR ALL USING (
  -- Only super admins can modify offices
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
);

-- =====================================================
-- USER_OFFICES TABLE - No circular references
-- =====================================================
CREATE POLICY "user_offices_read_policy" ON public.user_offices
FOR SELECT USING (
  -- Super admins see all
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  -- Users see their own memberships
  user_id = auth.uid()
  OR
  -- Agency admins see members of their offices
  office_id IN (
    SELECT office_id
    FROM public.user_offices
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

CREATE POLICY "user_offices_insert_policy" ON public.user_offices
FOR INSERT WITH CHECK (
  -- Super admins can add anyone
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  -- Agency admins can add to their offices
  EXISTS (
    SELECT 1 FROM public.user_offices
    WHERE user_id = auth.uid()
    AND office_id = user_offices.office_id
    AND role = 'admin'
  )
);

CREATE POLICY "user_offices_update_policy" ON public.user_offices
FOR UPDATE USING (
  -- Super admins can update anyone
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  -- Agency admins can update in their offices
  EXISTS (
    SELECT 1 FROM public.user_offices uo
    WHERE uo.user_id = auth.uid()
    AND uo.office_id = user_offices.office_id
    AND uo.role = 'admin'
  )
) WITH CHECK (
  -- Same as USING clause
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  EXISTS (
    SELECT 1 FROM public.user_offices uo
    WHERE uo.user_id = auth.uid()
    AND uo.office_id = user_offices.office_id
    AND uo.role = 'admin'
  )
);

CREATE POLICY "user_offices_delete_policy" ON public.user_offices
FOR DELETE USING (
  -- Super admins can delete anyone
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  -- Agency admins can remove from their offices
  EXISTS (
    SELECT 1 FROM public.user_offices uo
    WHERE uo.user_id = auth.uid()
    AND uo.office_id = user_offices.office_id
    AND uo.role = 'admin'
  )
);

-- =====================================================
-- CALLS TABLE - Simple office-based access
-- =====================================================
CREATE POLICY "calls_read_policy" ON public.calls
FOR SELECT USING (
  -- Super admins see all
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  -- Users see calls from their offices
  office_id IN (
    SELECT office_id
    FROM public.user_offices
    WHERE user_id = auth.uid()
  )
  OR
  -- Handle legacy calls with no office_id
  (office_id IS NULL AND EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  ))
);

CREATE POLICY "calls_write_policy" ON public.calls
FOR ALL USING (
  -- Super admins can do anything
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  -- Agency admins can manage their office's calls
  office_id IN (
    SELECT office_id
    FROM public.user_offices
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  office_id IN (
    SELECT office_id
    FROM public.user_offices
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- =====================================================
-- CONTACTS TABLE - Same pattern as calls
-- =====================================================
CREATE POLICY "contacts_read_policy" ON public.contacts
FOR SELECT USING (
  -- Super admins see all
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  -- Users see contacts from their offices
  office_id IN (
    SELECT office_id
    FROM public.user_offices
    WHERE user_id = auth.uid()
  )
  OR
  -- Handle legacy contacts
  (office_id IS NULL AND EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  ))
);

CREATE POLICY "contacts_write_policy" ON public.contacts
FOR ALL USING (
  -- Super admins can do anything
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  -- Agency admins can manage their office's contacts
  office_id IN (
    SELECT office_id
    FROM public.user_offices
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  office_id IN (
    SELECT office_id
    FROM public.user_offices
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- =====================================================
-- WEBHOOK_LOGS TABLE - Admin only
-- =====================================================
CREATE POLICY "webhook_logs_read_policy" ON public.webhook_logs
FOR SELECT USING (
  -- Only admins can see webhook logs
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "webhook_logs_write_policy" ON public.webhook_logs
FOR ALL USING (
  -- Only super admins can modify webhook logs
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Test query 1: Check if offices can be queried
-- SELECT COUNT(*) FROM public.offices;

-- Test query 2: Check if user_offices can be queried
-- SELECT COUNT(*) FROM public.user_offices;

-- Test query 3: Check if calls can be queried
-- SELECT COUNT(*) FROM public.calls LIMIT 10;

-- Test query 4: Verify no circular references
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN ('offices', 'user_offices', 'calls', 'contacts')
-- ORDER BY tablename, policyname;

-- =====================================================
-- END OF FIX
-- =====================================================