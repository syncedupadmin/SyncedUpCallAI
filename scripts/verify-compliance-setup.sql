-- =====================================================
-- COMPLIANCE SYSTEM VERIFICATION SCRIPT
-- Run this in Supabase SQL Editor to verify setup
-- =====================================================

-- Check if all required tables exist
DO $$
DECLARE
  v_table_count INTEGER;
  v_missing_tables TEXT[] := ARRAY[]::TEXT[];
  v_table TEXT;
BEGIN
  -- List of required tables
  FOR v_table IN
    SELECT unnest(ARRAY[
      'agencies',
      'user_agencies',
      'post_close_scripts',
      'post_close_segments',
      'post_close_compliance',
      'agent_post_close_performance',
      'post_close_audit_log',
      'compliance_notifications'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = v_table
    ) THEN
      v_missing_tables := array_append(v_missing_tables, v_table);
    END IF;
  END LOOP;

  -- Report results
  IF array_length(v_missing_tables, 1) > 0 THEN
    RAISE WARNING 'Missing tables: %', v_missing_tables;
  ELSE
    RAISE NOTICE '✅ All required tables exist';
  END IF;
END $$;

-- Check table structures
SELECT
  'Table Structure Check' as check_type,
  table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'post_close_scripts',
    'post_close_segments',
    'post_close_compliance',
    'agent_post_close_performance',
    'post_close_audit_log',
    'compliance_notifications'
  )
GROUP BY table_name
ORDER BY table_name;

-- Check if agency_id columns exist
SELECT
  'Agency ID Columns' as check_type,
  table_name,
  column_name,
  data_type,
  CASE
    WHEN column_name = 'agency_id' THEN '✅ Present'
    ELSE '❌ Missing'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'post_close_scripts',
    'post_close_segments',
    'post_close_compliance',
    'agent_post_close_performance',
    'post_close_audit_log',
    'compliance_notifications',
    'calls'
  )
  AND column_name = 'agency_id'
ORDER BY table_name;

-- Check RLS policies
SELECT
  'RLS Policies' as check_type,
  schemaname,
  tablename,
  policyname,
  CASE
    WHEN policyname LIKE '%agency_isolation%' THEN '✅ Agency Isolation'
    ELSE '⚠️ Other Policy'
  END as policy_type
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'post_close_scripts',
    'post_close_segments',
    'post_close_compliance',
    'agent_post_close_performance',
    'post_close_audit_log',
    'compliance_notifications'
  )
ORDER BY tablename, policyname;

-- Check if RLS is enabled
SELECT
  'RLS Status' as check_type,
  schemaname,
  tablename,
  rowsecurity,
  CASE
    WHEN rowsecurity THEN '✅ Enabled'
    ELSE '❌ Disabled'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'post_close_scripts',
    'post_close_segments',
    'post_close_compliance',
    'agent_post_close_performance',
    'post_close_audit_log',
    'compliance_notifications'
  )
ORDER BY tablename;

-- Check indexes
SELECT
  'Index Count' as check_type,
  tablename,
  COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'post_close_scripts',
    'post_close_segments',
    'post_close_compliance',
    'agent_post_close_performance',
    'post_close_audit_log',
    'compliance_notifications'
  )
GROUP BY tablename
ORDER BY tablename;

-- Check triggers
SELECT
  'Triggers' as check_type,
  event_object_table as table_name,
  trigger_name,
  event_manipulation as trigger_event,
  action_timing as timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN (
    'post_close_scripts',
    'agent_post_close_performance'
  )
ORDER BY event_object_table, trigger_name;

-- Check functions
SELECT
  'Functions' as check_type,
  routine_name,
  CASE
    WHEN routine_name IN (
      'update_post_close_timestamp',
      'log_script_activation',
      'is_super_admin'
    ) THEN '✅ Expected Function'
    ELSE '⚠️ Other Function'
  END as status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'update_post_close_timestamp',
    'log_script_activation',
    'is_super_admin'
  );

-- Check unique constraints
SELECT
  'Unique Constraints' as check_type,
  conname as constraint_name,
  conrelid::regclass as table_name
FROM pg_constraint
WHERE contype = 'u'
  AND connamespace = 'public'::regnamespace
  AND conrelid::regclass::text LIKE '%post_close%'
  OR conrelid::regclass::text LIKE '%agent_post_close%';

-- Summary statistics
SELECT
  'Summary Statistics' as report_type,
  'post_close_scripts' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE active = true) as active_scripts
FROM post_close_scripts
UNION ALL
SELECT
  'Summary Statistics',
  'post_close_segments',
  COUNT(*),
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')
FROM post_close_segments
UNION ALL
SELECT
  'Summary Statistics',
  'post_close_compliance',
  COUNT(*),
  COUNT(*) FILTER (WHERE compliance_passed = true)
FROM post_close_compliance
UNION ALL
SELECT
  'Summary Statistics',
  'compliance_notifications',
  COUNT(*),
  COUNT(*) FILTER (WHERE status = 'sent')
FROM compliance_notifications;

-- Final health check
DO $$
DECLARE
  v_table_count INTEGER;
  v_rls_count INTEGER;
  v_index_count INTEGER;
BEGIN
  -- Count tables
  SELECT COUNT(*)
  INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'post_close_scripts',
      'post_close_segments',
      'post_close_compliance',
      'agent_post_close_performance',
      'post_close_audit_log',
      'compliance_notifications'
    );

  -- Count RLS-enabled tables
  SELECT COUNT(*)
  INTO v_rls_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = true
    AND tablename IN (
      'post_close_scripts',
      'post_close_segments',
      'post_close_compliance',
      'agent_post_close_performance',
      'post_close_audit_log',
      'compliance_notifications'
    );

  -- Count indexes
  SELECT COUNT(*)
  INTO v_index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename LIKE '%post_close%'
    OR tablename LIKE '%compliance%';

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'COMPLIANCE SYSTEM HEALTH CHECK COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables Created: % of 6', v_table_count;
  RAISE NOTICE 'RLS Enabled: % of 6', v_rls_count;
  RAISE NOTICE 'Total Indexes: %', v_index_count;
  RAISE NOTICE '';

  IF v_table_count = 6 AND v_rls_count = 6 THEN
    RAISE NOTICE '✅ SYSTEM STATUS: FULLY OPERATIONAL';
  ELSE
    RAISE WARNING '⚠️ SYSTEM STATUS: CONFIGURATION INCOMPLETE';
  END IF;

  RAISE NOTICE '========================================';
END $$;