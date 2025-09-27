-- =====================================================
-- DATABASE ISOLATION TEST SCRIPT
-- =====================================================
-- Run this in Supabase SQL Editor as different users
-- to verify complete multi-tenant isolation.
--
-- IMPORTANT: Run as Agency A user, then as Agency B user
-- =====================================================

-- =====================================================
-- TEST 1: Verify current user's agency access
-- =====================================================
SELECT
    '=== Current User Agency Access ===' as test_section,
    auth.uid() as current_user_id,
    ua.agency_id,
    a.name as agency_name,
    a.slug as agency_slug,
    ua.role as user_role,
    public.is_super_admin() as is_super_admin
FROM public.user_agencies ua
JOIN public.agencies a ON a.id = ua.agency_id
WHERE ua.user_id = auth.uid();

-- =====================================================
-- TEST 2: Verify user can only see their agency's calls
-- =====================================================
SELECT
    '=== Calls Visibility Test ===' as test_section,
    COUNT(*) as total_calls_visible,
    COUNT(DISTINCT agency_id) as unique_agencies,
    CASE
        WHEN COUNT(DISTINCT agency_id) = 1 THEN '✅ PASS: Only one agency visible'
        WHEN COUNT(DISTINCT agency_id) > 1 AND public.is_super_admin() THEN '✅ PASS: Super admin sees multiple agencies'
        ELSE '❌ FAIL: Multiple agencies visible to regular user'
    END as test_result
FROM public.calls;

-- =====================================================
-- TEST 3: List agency IDs visible to current user
-- =====================================================
SELECT
    '=== Agency IDs Visible ===' as test_section,
    DISTINCT agency_id,
    COUNT(*) as calls_count
FROM public.calls
GROUP BY agency_id
ORDER BY calls_count DESC;

-- =====================================================
-- TEST 4: Verify transcripts are isolated
-- =====================================================
SELECT
    '=== Transcripts Visibility Test ===' as test_section,
    COUNT(*) as total_transcripts_visible,
    COUNT(DISTINCT agency_id) as unique_agencies,
    CASE
        WHEN COUNT(DISTINCT agency_id) = 1 THEN '✅ PASS: Only one agency visible'
        WHEN COUNT(DISTINCT agency_id) > 1 AND public.is_super_admin() THEN '✅ PASS: Super admin sees multiple agencies'
        ELSE '❌ FAIL: Multiple agencies visible to regular user'
    END as test_result
FROM public.transcripts;

-- =====================================================
-- TEST 5: Verify analyses are isolated
-- =====================================================
SELECT
    '=== Analyses Visibility Test ===' as test_section,
    COUNT(*) as total_analyses_visible,
    COUNT(DISTINCT agency_id) as unique_agencies,
    CASE
        WHEN COUNT(DISTINCT agency_id) = 1 THEN '✅ PASS: Only one agency visible'
        WHEN COUNT(DISTINCT agency_id) > 1 AND public.is_super_admin() THEN '✅ PASS: Super admin sees multiple agencies'
        ELSE '❌ FAIL: Multiple agencies visible to regular user'
    END as test_result
FROM public.analyses;

-- =====================================================
-- TEST 6: Verify contacts are isolated
-- =====================================================
SELECT
    '=== Contacts Visibility Test ===' as test_section,
    COUNT(*) as total_contacts_visible,
    COUNT(DISTINCT agency_id) as unique_agencies,
    CASE
        WHEN COUNT(DISTINCT agency_id) = 1 THEN '✅ PASS: Only one agency visible'
        WHEN COUNT(DISTINCT agency_id) > 1 AND public.is_super_admin() THEN '✅ PASS: Super admin sees multiple agencies'
        ELSE '❌ FAIL: Multiple agencies visible to regular user'
    END as test_result
FROM public.contacts;

-- =====================================================
-- TEST 7: Verify agents are isolated
-- =====================================================
SELECT
    '=== Agents Visibility Test ===' as test_section,
    COUNT(*) as total_agents_visible,
    COUNT(DISTINCT agency_id) as unique_agencies,
    CASE
        WHEN COUNT(DISTINCT agency_id) = 1 THEN '✅ PASS: Only one agency visible'
        WHEN COUNT(DISTINCT agency_id) > 1 AND public.is_super_admin() THEN '✅ PASS: Super admin sees multiple agencies'
        ELSE '❌ FAIL: Multiple agencies visible to regular user'
    END as test_result
FROM public.agents;

-- =====================================================
-- TEST 8: Try to query specific agency (should fail for unauthorized)
-- =====================================================
-- Replace 'TARGET_AGENCY_ID' with an actual agency ID from another agency
--
-- SELECT
--     '=== Cross-Agency Access Test ===' as test_section,
--     COUNT(*) as calls_from_other_agency,
--     CASE
--         WHEN COUNT(*) = 0 THEN '✅ PASS: Cannot access other agency data'
--         WHEN COUNT(*) > 0 AND public.is_super_admin() THEN '✅ PASS: Super admin can access'
--         ELSE '❌ FAIL: Unauthorized cross-agency access'
--     END as test_result
-- FROM public.calls
-- WHERE agency_id = 'TARGET_AGENCY_ID';

-- =====================================================
-- TEST 9: Verify RLS is enabled on all tables
-- =====================================================
SELECT
    '=== RLS Status Check ===' as test_section,
    tablename,
    CASE
        WHEN rowsecurity THEN '✅ RLS Enabled'
        ELSE '❌ RLS Disabled'
    END as rls_status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
AND t.tablename IN (
    'calls', 'transcripts', 'analyses',
    'contacts', 'agents', 'call_events',
    'transcript_embeddings'
)
ORDER BY tablename;

-- =====================================================
-- TEST 10: Verify RLS policies exist
-- =====================================================
SELECT
    '=== RLS Policies Check ===' as test_section,
    tablename,
    COUNT(*) as policy_count,
    CASE
        WHEN COUNT(*) >= 3 THEN '✅ Has policies (SELECT, INSERT, UPDATE)'
        WHEN COUNT(*) > 0 THEN '⚠️  Has some policies'
        ELSE '❌ No policies'
    END as policy_status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
    'calls', 'transcripts', 'analyses',
    'contacts', 'agents', 'call_events',
    'transcript_embeddings'
)
GROUP BY tablename
ORDER BY tablename;

-- =====================================================
-- TEST 11: Test INSERT isolation (will use user's agency)
-- =====================================================
-- This should automatically set the correct agency_id
-- DO NOT run this if you don't want test data
--
-- INSERT INTO public.calls (
--     source,
--     source_ref,
--     started_at,
--     agency_id
-- ) VALUES (
--     'ISOLATION_TEST',
--     'test-' || gen_random_uuid(),
--     NOW(),
--     (SELECT agency_id FROM user_agencies WHERE user_id = auth.uid() LIMIT 1)
-- ) RETURNING
--     id,
--     agency_id,
--     '✅ Insert succeeded with correct agency_id' as test_result;

-- =====================================================
-- SUMMARY
-- =====================================================
SELECT
    '=== ISOLATION TEST SUMMARY ===' as test_section,
    'Run this script as different agency users' as instruction,
    'Each user should only see their own agency data' as expected_result,
    'If you see data from multiple agencies (and not super admin), ISOLATION FAILED' as warning;