-- Reset password for nicholas.stults@gmail.com
-- This sets the password to: TestPassword123!
--
-- IMPORTANT: Change this password immediately after logging in

UPDATE auth.users
SET 
  encrypted_password = crypt('TestPassword123!', gen_salt('bf')),
  email_confirmed_at = NOW(),
  confirmed_at = NOW(),
  updated_at = NOW()
WHERE email = 'nicholas.stults@gmail.com';

-- Verify the update
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  updated_at
FROM auth.users
WHERE email = 'nicholas.stults@gmail.com';
