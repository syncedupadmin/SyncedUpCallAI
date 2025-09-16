-- Check the calls table structure and defaults
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'calls'
  AND column_name IN ('source', 'agent_name', 'phone_number', 'metadata')
ORDER BY ordinal_position;

-- Check if there are any triggers on the calls table
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'calls';

-- Check for any functions that might be setting source = 'webhook'
SELECT
  routine_name,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_definition LIKE '%webhook%'
  AND routine_definition LIKE '%INSERT%';

-- Check if there's a default value on the source column
SELECT
  table_name,
  column_name,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'calls'
  AND column_name = 'source';