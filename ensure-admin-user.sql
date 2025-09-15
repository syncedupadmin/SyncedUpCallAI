-- First, check what admin users exist
SELECT * FROM public.admin_users;

-- Get your current auth user details when logged in
SELECT
  auth.uid() as your_user_id,
  auth.jwt() ->> 'email' as your_email;

-- If no admin exists for admin@syncedupsolutions.com, insert one
-- IMPORTANT: Replace 'YOUR-USER-ID-HERE' with the user_id from the query above
INSERT INTO public.admin_users (user_id, email, created_at)
VALUES (
  'YOUR-USER-ID-HERE', -- Replace this with your actual auth.uid()
  'admin@syncedupsolutions.com',
  NOW()
)
ON CONFLICT (user_id) DO UPDATE
SET email = EXCLUDED.email;

-- Alternative: If you want to make your current user an admin regardless of email
-- Just uncomment and run this after logging in:
-- INSERT INTO public.admin_users (user_id, email, created_at)
-- SELECT
--   auth.uid(),
--   auth.jwt() ->> 'email',
--   NOW()
-- ON CONFLICT (user_id) DO NOTHING;