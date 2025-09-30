-- Check if this specific profile exists
SELECT * FROM profiles WHERE id = '14ddd0fa-b88f-4ff9-b598-97e445229e7b';

-- Check all profiles
SELECT * FROM profiles ORDER BY created_at DESC;

-- Delete this specific profile if it exists
-- DELETE FROM profiles WHERE id = '14ddd0fa-b88f-4ff9-b598-97e445229e7b';