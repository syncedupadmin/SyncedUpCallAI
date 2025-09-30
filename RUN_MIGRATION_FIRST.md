# ⚠️ CRITICAL: RUN THIS MIGRATION BEFORE TESTING

## Error You're Seeing
```
500 Internal Server Error
Failed to create agency
```

## Root Cause
The database migration hasn't been run yet. The `agencies` table needs new columns for the discovery system.

## Fix: Run the Migration

### Option 1: Using psql (Recommended)
```bash
# Connect to your database
psql $DATABASE_URL

# Or if you have the connection string
psql "postgresql://user:pass@host:port/dbname"

# Then paste and run the migration
\i supabase/migrations/20250929_agency_discovery_flow.sql

# Or copy/paste the entire contents
```

### Option 2: Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" in left sidebar
4. Click "New query"
5. Copy entire contents of `supabase/migrations/20250929_agency_discovery_flow.sql`
6. Paste and click "Run"

### Option 3: Supabase CLI
```bash
# If you have Supabase CLI installed
supabase db push
```

## Verify Migration Worked
After running, check:
```sql
-- Should return 4 rows
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'agencies'
  AND column_name IN ('discovery_status', 'discovery_session_id', 'convoso_credentials', 'discovery_skip_reason');
```

Expected output:
```
 column_name
-------------------------
 discovery_status
 discovery_session_id
 convoso_credentials
 discovery_skip_reason
```

## After Migration Runs Successfully
1. Go back to: https://aicall.syncedupsolutions.com/register
2. Fill out the registration form
3. Submit
4. Should successfully create agency and redirect to `/dashboard`
5. Middleware will then redirect to `/dashboard/discovery` (first login)

---

**DO NOT test the registration until this migration is complete!**