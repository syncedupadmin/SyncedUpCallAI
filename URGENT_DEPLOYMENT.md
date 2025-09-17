# 🚨 URGENT PRODUCTION FIX - DEPLOY NOW

## Step 1: Deploy Code Fix (1 minute)

```bash
git add .
git commit -m "HOTFIX: Fix production database and function errors"
git push origin main
```

## Step 2: Run SQL Migration in Supabase (2 minutes)

1. Go to your Supabase Dashboard
2. Click SQL Editor
3. Copy and paste ALL content from: `supabase/migrations/hotfix-production-errors.sql`
4. Click RUN
5. Should see "Success" message

## Step 3: Add Missing Environment Variables in Vercel (2 minutes)

Go to: https://vercel.com/[your-team]/[your-project]/settings/environment-variables

Add these NOW if missing:

```
CONVOSO_API_BASE=https://api.convoso.com/v1
APP_URL=https://synced-up-call-ai.vercel.app
JOBS_SECRET=your-secret-key-here
```

## Step 4: Verify Fixes

After deployment (~ 2-3 minutes):

1. Check if errors stopped in Vercel logs
2. Test admin panel: https://synced-up-call-ai.vercel.app/admin/super
3. Check calls page loads without errors

## What This Fixes:

✅ "attempts is ambiguous" error - FIXED
✅ "ct.phone_e164 does not exist" error - FIXED
✅ Missing RPC functions (get_users_by_level_v2, create_agent_user) - FIXED
✅ Missing environment variables - DOCUMENTED

## If Still Having Issues:

Missing environment variable? Add it in Vercel:
- `CONVOSO_API_KEY`
- `CONVOSO_AUTH_TOKEN`
- `WEBHOOK_SECRET`

Database still erroring? Run this check:
```sql
-- Check if functions exist
SELECT proname FROM pg_proc WHERE proname IN ('get_users_by_level_v2', 'create_agent_user', 'is_admin', 'get_next_transcription_job');

-- Check if tables exist
SELECT table_name FROM information_schema.tables WHERE table_name IN ('user_profiles', 'transcription_queue', 'contacts');
```

## Emergency Rollback:

If something breaks worse:
```bash
git revert HEAD
git push origin main
```

Then in Supabase, run previous migration rollbacks if needed.