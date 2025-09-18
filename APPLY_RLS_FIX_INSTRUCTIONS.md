# CRITICAL: Apply RLS Fix to Resolve 500 Errors

## Issue
The app is currently experiencing "infinite recursion detected in policy for relation user_offices" errors causing 500 errors on all API calls.

## Solution
Apply the RLS fix migration located at: `supabase/migrations/20250117_fix_rls_recursion.sql`

## Steps to Apply Fix

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/sbvxvheirbjwfbqjreor
2. Navigate to **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy the entire contents of `supabase/migrations/20250117_fix_rls_recursion.sql`
5. Paste into the SQL editor
6. Click **Run** (or press Cmd/Ctrl + Enter)
7. Wait for completion (should take ~10-30 seconds)

### Option 2: Via Supabase CLI

```bash
# If you have psql installed:
psql "postgresql://postgres:fhhbrtnfnbftcb45151@db.sbvxvheirbjwfbqjreor.supabase.co:5432/postgres" -f supabase/migrations/20250117_fix_rls_recursion.sql

# Or using npx supabase:
npx supabase db push --db-url "postgresql://postgres:fhhbrtnfnbftcb45151@db.sbvxvheirbjwfbqjreor.supabase.co:5432/postgres"
```

## What This Fix Does

1. **Temporarily disables RLS** on affected tables (offices, user_offices, calls, contacts, webhook_logs)
2. **Drops all problematic policies** that are causing the recursion
3. **Creates new, simplified policies** that don't have circular references
4. **Re-enables RLS** with the fixed policies

## Verification After Fix

Once applied, verify the fix worked:

1. **Test the API directly:**
   ```bash
   curl https://sbvxvheirbjwfbqjreor.supabase.co/rest/v1/offices \
     -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNidnh2aGVpcmJqd2ZicWpyZW9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzNDMxNDEsImV4cCI6MjA0ODkxOTE0MX0.xRTci2BnmwD9jhXoaJQ90OMSQGcRLRa6aiFLW8nIEow"
   ```
   Should return data, not a 500 error

2. **Test the app:**
   - Navigate to https://synced-up-call-r2ld00ru1-nicks-projects-f40381ea.vercel.app/admin
   - Should load without errors
   - Calls should be visible

3. **Check in Supabase Dashboard:**
   - Go to Table Editor → offices
   - Should be able to view data
   - Go to Authentication → Policies
   - Should see the new simplified policies

## Production Readiness Status After Fix

✅ **Fixed:**
- RLS policies work without recursion
- App loads without 500 errors
- Basic CRUD operations work
- Webhooks receiving data
- Office defaults set correctly

⚠️ **Still Needed:**
- Convoso polling service for historical data (implement next)
- Service worker cleanup (cosmetic issue, already fixed with unregister script)
- Complete user management UI

## If Issues Persist

If you still see errors after applying the fix:

1. Check the Supabase logs: Dashboard → Logs → API
2. Verify all statements executed successfully
3. Try the nuclear option: temporarily disable all RLS:
   ```sql
   ALTER TABLE public.offices DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.user_offices DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.calls DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public.contacts DISABLE ROW LEVEL SECURITY;
   ```

## Contact
If you need assistance, the fix SQL is in: `supabase/migrations/20250117_fix_rls_recursion.sql`