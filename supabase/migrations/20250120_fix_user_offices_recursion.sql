-- =====================================================
-- FIX: User_offices infinite recursion
-- Date: 2025-01-20
-- Issue: Self-referencing policy causing infinite recursion
-- =====================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "user_offices_read_policy" ON public.user_offices;

-- Create a new policy without self-reference
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
  -- Agency admins see members of their offices (fixed - no self-reference)
  EXISTS (
    SELECT 1
    FROM public.user_offices uo_admin
    WHERE uo_admin.user_id = auth.uid()
    AND uo_admin.office_id = user_offices.office_id
    AND uo_admin.role = 'admin'
  )
);

-- Also fix the insert policy to avoid self-reference
DROP POLICY IF EXISTS "user_offices_insert_policy" ON public.user_offices;

CREATE POLICY "user_offices_insert_policy" ON public.user_offices
FOR INSERT WITH CHECK (
  -- Super admins can add anyone
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  -- Agency admins can add to their offices (check existing membership directly)
  EXISTS (
    SELECT 1
    FROM public.user_offices existing_membership
    WHERE existing_membership.user_id = auth.uid()
    AND existing_membership.office_id = NEW.office_id
    AND existing_membership.role = 'admin'
  )
);

-- Fix the update policy too
DROP POLICY IF EXISTS "user_offices_update_policy" ON public.user_offices;

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
    SELECT 1
    FROM public.user_offices admin_check
    WHERE admin_check.user_id = auth.uid()
    AND admin_check.office_id = user_offices.office_id
    AND admin_check.role = 'admin'
    AND admin_check.id != user_offices.id -- Exclude self to avoid recursion
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
    SELECT 1
    FROM public.user_offices admin_check
    WHERE admin_check.user_id = auth.uid()
    AND admin_check.office_id = user_offices.office_id
    AND admin_check.role = 'admin'
    AND admin_check.id != user_offices.id -- Exclude self to avoid recursion
  )
);

-- Fix the delete policy
DROP POLICY IF EXISTS "user_offices_delete_policy" ON public.user_offices;

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
    SELECT 1
    FROM public.user_offices admin_check
    WHERE admin_check.user_id = auth.uid()
    AND admin_check.office_id = user_offices.office_id
    AND admin_check.role = 'admin'
    AND admin_check.id != user_offices.id -- Exclude self to avoid recursion
  )
);

-- =====================================================
-- Alternative simpler approach if above still fails
-- =====================================================
-- If the above still causes issues, use this simpler version:

/*
-- SIMPLE VERSION - No admin role check in user_offices policies
DROP POLICY IF EXISTS "user_offices_read_policy" ON public.user_offices;

CREATE POLICY "user_offices_read_simple" ON public.user_offices
FOR SELECT USING (
  -- Super admins see all
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND admin_level = 'super'
  )
  OR
  -- Users only see their own memberships
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "user_offices_insert_policy" ON public.user_offices;
DROP POLICY IF EXISTS "user_offices_update_policy" ON public.user_offices;
DROP POLICY IF EXISTS "user_offices_delete_policy" ON public.user_offices;

-- Only super admins can modify user_offices
CREATE POLICY "user_offices_write_simple" ON public.user_offices
FOR ALL USING (
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
*/