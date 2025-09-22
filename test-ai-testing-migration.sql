-- Test script to verify AI testing migration
-- Run this AFTER running the main migration

-- 1. Check all tables were created
SELECT table_name,
       CASE WHEN table_name IS NOT NULL THEN '✅ Created' ELSE '❌ Missing' END as status
FROM (
  VALUES
    ('ai_test_suites'),
    ('ai_test_cases'),
    ('ai_test_runs'),
    ('ai_test_feedback'),
    ('ai_accuracy_metrics'),
    ('ai_suite_runs'),
    ('ai_test_templates'),
    ('ai_simulation_profiles'),
    ('ai_training_corrections'),
    ('ai_model_experiments')
) AS required(table_name)
LEFT JOIN information_schema.tables t
  ON t.table_name = required.table_name
  AND t.table_schema = 'public'
ORDER BY required.table_name;

-- 2. Check views were created
SELECT table_name as view_name,
       CASE WHEN table_name IS NOT NULL THEN '✅ Created' ELSE '❌ Missing' END as status
FROM (
  VALUES
    ('ai_test_performance_realtime'),
    ('ai_feedback_summary'),
    ('ai_engine_comparison')
) AS required(table_name)
LEFT JOIN information_schema.views v
  ON v.table_name = required.table_name
  AND v.table_schema = 'public'
ORDER BY required.table_name;

-- 3. Check if is_test column was added to calls table
SELECT column_name,
       CASE WHEN column_name IS NOT NULL THEN '✅ Added' ELSE '❌ Missing' END as status
FROM (VALUES ('is_test')) AS required(column_name)
LEFT JOIN information_schema.columns c
  ON c.column_name = required.column_name
  AND c.table_name = 'calls'
  AND c.table_schema = 'public';

-- 4. Check functions were created
SELECT proname as function_name,
       CASE WHEN proname IS NOT NULL THEN '✅ Created' ELSE '❌ Missing' END as status
FROM (
  VALUES
    ('calculate_wer'),
    ('calculate_test_metrics')
) AS required(proname)
LEFT JOIN pg_proc p
  ON p.proname = required.proname
  AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY required.proname;

-- 5. Check triggers were created
SELECT tgname as trigger_name,
       CASE WHEN tgname IS NOT NULL THEN '✅ Created' ELSE '❌ Missing' END as status
FROM (VALUES ('trigger_calculate_test_metrics')) AS required(tgname)
LEFT JOIN pg_trigger t
  ON t.tgname = required.tgname;

-- 6. Check sample data was inserted
SELECT
  (SELECT COUNT(*) FROM ai_test_templates) as template_count,
  (SELECT COUNT(*) FROM ai_simulation_profiles) as profile_count;

-- 7. Test the calculate_wer function
SELECT calculate_wer(
  'Hello world this is a test',
  'Hello world this is test'
) as wer_should_be_about_0_17;

-- 8. Test creating a test suite (basic smoke test)
DO $$
DECLARE
  test_suite_id UUID;
BEGIN
  -- Create a test suite
  INSERT INTO ai_test_suites (name, description, test_type)
  VALUES ('Migration Test Suite', 'Test suite to verify migration', 'transcription')
  RETURNING id INTO test_suite_id;

  -- Create a test case
  INSERT INTO ai_test_cases (
    suite_id,
    name,
    audio_url,
    expected_transcript,
    test_category
  )
  VALUES (
    test_suite_id,
    'Test Case 1',
    'https://example.com/test.mp3',
    'This is a test transcript',
    'clear_speech'
  );

  RAISE NOTICE 'Test suite created successfully with ID: %', test_suite_id;

  -- Clean up test data
  DELETE FROM ai_test_suites WHERE id = test_suite_id;

  RAISE NOTICE 'Test data cleaned up successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error during test: %', SQLERRM;
END $$;

-- 9. Verify the views work
SELECT 'Testing ai_test_performance_realtime view' as test;
SELECT * FROM ai_test_performance_realtime LIMIT 1;

SELECT 'Testing ai_feedback_summary view' as test;
SELECT * FROM ai_feedback_summary LIMIT 1;

SELECT 'Testing ai_engine_comparison view' as test;
SELECT * FROM ai_engine_comparison LIMIT 1;

-- Summary
SELECT 'AI Testing System Migration Verification Complete' as status,
       'Check the results above for any ❌ Missing items' as action;