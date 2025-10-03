-- Enable Realtime for agencies table and related tables
-- This fixes the subscription error in the super admin portal

-- Enable Realtime on the agencies table
ALTER PUBLICATION supabase_realtime ADD TABLE public.agencies;

-- Enable Realtime on user_agencies table for member updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_agencies;

-- Enable Realtime on profiles table for user updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Verify Realtime is enabled (optional check)
-- SELECT schemaname, tablename
-- FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime'
-- ORDER BY schemaname, tablename;

-- Note: After running this migration, you may need to:
-- 1. Restart your Realtime service in Supabase Dashboard
-- 2. Or wait a few minutes for changes to propagate