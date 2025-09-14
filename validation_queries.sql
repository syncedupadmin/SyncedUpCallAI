-- Database Validation Queries for SyncedUpCallAI v1.0

-- 1. Count rows in all tables
SELECT 'calls' as table_name, COUNT(*) as row_count FROM calls
UNION ALL
SELECT 'transcripts', COUNT(*) FROM transcripts
UNION ALL
SELECT 'analyses', COUNT(*) FROM analyses
UNION ALL
SELECT 'call_events', COUNT(*) FROM call_events
UNION ALL
SELECT 'agents', COUNT(*) FROM agents
UNION ALL
SELECT 'contacts', COUNT(*) FROM contacts;

-- 2. Check for embeddings tables (handle both naming conventions)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('transcript_embeddings', 'embeddings', 'embeddings_meta');

-- 3. Check for orphan transcripts
SELECT COUNT(*) as orphan_transcripts
FROM transcripts t
LEFT JOIN calls c ON t.call_id = c.id
WHERE c.id IS NULL;

-- 4. Check for orphan analyses
SELECT COUNT(*) as orphan_analyses
FROM analyses a
LEFT JOIN calls c ON a.call_id = c.id
WHERE c.id IS NULL;

-- 5. Recent activity check
SELECT
  DATE(created_at) as date,
  COUNT(*) as calls_created
FROM calls
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;