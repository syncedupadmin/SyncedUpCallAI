# Discovery Migration Fix

## Issue
When running `supabase/migrations/20250929_agency_discovery_flow.sql`, you encountered:
```
ERROR: 42703: column "created_at" does not exist
```

## Root Cause
The `discovery_sessions` table (from `add-discovery-system.sql`) uses `started_at` instead of `created_at` for the timestamp column, but the new migration was incorrectly referencing `created_at` in the index definition.

## Fix Applied
**File:** `supabase/migrations/20250929_agency_discovery_flow.sql`
**Line 25:** Changed from `created_at` to `started_at`

**Before:**
```sql
CREATE INDEX IF NOT EXISTS idx_discovery_sessions_agency
  ON discovery_sessions(agency_id, created_at DESC);
```

**After:**
```sql
CREATE INDEX IF NOT EXISTS idx_discovery_sessions_agency
  ON discovery_sessions(agency_id, started_at DESC);
```

## Verification
Run this to confirm the column exists:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'discovery_sessions'
  AND column_name IN ('started_at', 'created_at');
```

**Expected Result:**
```
 column_name | data_type
-------------+-----------------------------
 started_at  | timestamp without time zone
```

## Migration Status
✅ **FIXED** - Migration should now run successfully

## Run the Migration Again
```bash
# Option 1: Supabase CLI
supabase db push

# Option 2: Direct SQL
psql $DATABASE_URL < supabase/migrations/20250929_agency_discovery_flow.sql

# Option 3: Supabase Dashboard
# Copy/paste the file contents into SQL Editor and run
```

## Verify Success
After running, verify the columns were added:
```sql
-- Check agencies table
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'agencies'
  AND column_name IN ('discovery_status', 'discovery_session_id', 'convoso_credentials', 'discovery_skip_reason');

-- Expected: All 4 columns should be listed

-- Check discovery_sessions table
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'discovery_sessions'
  AND column_name = 'agency_id';

-- Expected: agency_id column should be listed

-- Check RLS policies
SELECT policyname FROM pg_policies WHERE tablename = 'discovery_sessions';

-- Expected: 3 policies listed (view, insert, update)
```

## Summary
- **Error:** `column "created_at" does not exist`
- **Cause:** Wrong column name in index definition
- **Fix:** Changed `created_at` to `started_at` on line 25
- **Status:** ✅ Resolved

You can now run the migration successfully!