-- =====================================================
-- FIX ORPHANED DATA BEFORE MIGRATION
-- =====================================================
-- This script cleans up data that doesn't have proper
-- relationships before applying the isolation migration.
-- =====================================================

-- Step 1: Check for orphaned data
SELECT
    'Orphaned Transcripts' as issue,
    COUNT(*) as count
FROM transcripts t
WHERE NOT EXISTS (SELECT 1 FROM calls c WHERE c.id = t.call_id);

SELECT
    'Orphaned Analyses' as issue,
    COUNT(*) as count
FROM analyses a
WHERE NOT EXISTS (SELECT 1 FROM calls c WHERE c.id = a.call_id);

SELECT
    'Orphaned Call Events' as issue,
    COUNT(*) as count
FROM call_events ce
WHERE call_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM calls c WHERE c.id = ce.call_id);

SELECT
    'Orphaned Transcript Embeddings' as issue,
    COUNT(*) as count
FROM transcript_embeddings te
WHERE NOT EXISTS (SELECT 1 FROM calls c WHERE c.id = te.call_id);

-- Step 2: Option A - DELETE orphaned data (recommended)
-- Uncomment to delete orphaned records

-- DELETE FROM transcripts
-- WHERE NOT EXISTS (SELECT 1 FROM calls c WHERE c.id = transcripts.call_id);

-- DELETE FROM analyses
-- WHERE NOT EXISTS (SELECT 1 FROM calls c WHERE c.id = analyses.call_id);

-- DELETE FROM call_events
-- WHERE call_id IS NOT NULL
-- AND NOT EXISTS (SELECT 1 FROM calls c WHERE c.id = call_events.call_id);

-- DELETE FROM transcript_embeddings
-- WHERE NOT EXISTS (SELECT 1 FROM calls c WHERE c.id = transcript_embeddings.call_id);

-- Step 3: Option B - Create placeholder calls for orphaned data
-- Only use this if you want to preserve the orphaned data

/*
INSERT INTO calls (id, source, source_ref, started_at, agency_id)
SELECT
    t.call_id,
    'RECOVERED_DATA',
    'orphaned-transcript',
    COALESCE((SELECT MIN(created_at) FROM calls), NOW()),
    (SELECT id FROM agencies ORDER BY created_at ASC LIMIT 1)
FROM transcripts t
WHERE NOT EXISTS (SELECT 1 FROM calls c WHERE c.id = t.call_id)
ON CONFLICT (id) DO NOTHING;
*/

-- Step 4: Verification - should return 0 for all
SELECT
    'Remaining Orphaned Transcripts' as check_after,
    COUNT(*) as count
FROM transcripts t
WHERE NOT EXISTS (SELECT 1 FROM calls c WHERE c.id = t.call_id);