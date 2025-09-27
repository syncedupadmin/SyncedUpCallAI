-- SUPABASE MULTI-TENANT SECURITY AUDIT
-- Run this query in Supabase SQL Editor to verify database isolation

-- =====================================================
-- CHECK 1: Tables with agency_id column and RLS status
-- =====================================================
SELECT
    t.table_name,
    CASE
        WHEN c.column_name IS NOT NULL THEN '✅ Has agency_id'
        ELSE '❌ MISSING agency_id'
    END as agency_isolation,
    CASE
        WHEN rls.relrowsecurity THEN '✅ RLS Enabled'
        ELSE '❌ RLS Disabled'
    END as row_level_security,
    pg_size_pretty(pg_total_relation_size('"public".' || t.table_name)) as table_size
FROM information_schema.tables t
LEFT JOIN information_schema.columns c
    ON t.table_name = c.table_name
    AND c.column_name = 'agency_id'
    AND c.table_schema = 'public'
LEFT JOIN pg_class rls
    ON rls.relname = t.table_name
    AND rls.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
ORDER BY
    CASE WHEN c.column_name IS NULL THEN 0 ELSE 1 END,
    t.table_name;

-- =====================================================
-- CHECK 2: Verify agency_id constraints
-- =====================================================
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
    AND kcu.column_name = 'agency_id'
ORDER BY tc.table_name;

-- =====================================================
-- CHECK 3: List all RLS policies
-- =====================================================
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd as operation,
    CASE
        WHEN qual IS NOT NULL AND qual LIKE '%is_super_admin%' THEN '✅ Has super admin bypass'
        WHEN qual IS NOT NULL AND qual LIKE '%agency%' THEN '✅ Agency filtered'
        ELSE '⚠️  No agency filter'
    END as security_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- =====================================================
-- CHECK 4: Verify indexes for performance
-- =====================================================
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexdef LIKE '%agency_id%'
ORDER BY tablename, indexname;

-- =====================================================
-- CHECK 5: Count rows by agency (if you have data)
-- =====================================================
SELECT
    'calls' as table_name,
    agency_id,
    COUNT(*) as row_count
FROM public.calls
GROUP BY agency_id
ORDER BY row_count DESC
LIMIT 10;

-- =====================================================
-- CHECK 6: Verify user_agencies table structure
-- =====================================================
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'user_agencies'
ORDER BY ordinal_position;

-- =====================================================
-- CHECK 7: Test is_super_admin function exists
-- =====================================================
SELECT
    routine_name,
    routine_type,
    data_type as return_type,
    security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name LIKE '%admin%'
ORDER BY routine_name;