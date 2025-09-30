-- Cleanup script for orphaned agency records
-- Run this in your Supabase SQL Editor

-- Step 1: Find the agency with slug 'test-llc'
SELECT id, name, slug, owner_user_id, created_at
FROM agencies
WHERE slug = 'test-llc';

-- Step 2: Delete the agency (this will cascade to related tables)
-- Uncomment the line below after verifying the agency ID above
-- DELETE FROM agencies WHERE slug = 'test-llc';

-- Alternative: If you want to find all orphaned agencies (where owner doesn't exist in auth.users)
-- SELECT a.id, a.name, a.slug, a.owner_user_id, a.created_at
-- FROM agencies a
-- LEFT JOIN auth.users u ON a.owner_user_id = u.id
-- WHERE u.id IS NULL;

-- To delete all orphaned agencies:
-- DELETE FROM agencies WHERE owner_user_id NOT IN (SELECT id FROM auth.users);