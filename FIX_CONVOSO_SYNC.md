# Fix Convoso Sync Issues

## Problems Identified

1. ✅ **Wrong API Endpoint**: Was using `/calllog/search` instead of `/leads/get-recordings`
2. ✅ **Missing Tables**: `sync_state` and `convoso_sync_status` tables not created
3. ✅ **Wrong Response Parsing**: Expected `data.data.entries` but API returns `data.data` array directly
4. ⚠️ **Tables Need Creation**: Database tables for sync tracking need to be created

## Fixes Applied

### 1. Code Fixes (Already Applied)
- Updated `src/lib/convoso-sync.ts` to use correct endpoint
- Fixed response parsing to handle correct data structure
- Added proper date formatting for API parameters

### 2. Database Migration (Needs Application)

**Apply the migration:** `supabase/migrations/20250117_ensure_convoso_tables.sql`

#### Via Supabase Dashboard:
1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/sbvxvheirbjwfbqjreor/sql/new)
2. Copy contents of `supabase/migrations/20250117_ensure_convoso_tables.sql`
3. Paste and click **Run**

This migration will:
- Create `sync_state` table for tracking last sync time
- Create `convoso_sync_status` table for sync history
- Add missing columns to `calls` table
- Create necessary indexes
- Set up triggers for updated_at timestamps

## Testing the Fix

### 1. Test Convoso API Connection
```bash
curl -X GET "https://synced-up-call-nmd6n74qt-nicks-projects-f40381ea.vercel.app/api/test/convoso-api-test"
```

### 2. Test Manual Sync (After applying migration)
```bash
# With cron secret
curl -X GET "https://synced-up-call-nmd6n74qt-nicks-projects-f40381ea.vercel.app/api/cron/convoso-sync" \
  -H "x-cron-secret: UYJT1451JBTIKMBUT11K4HH"
```

### 3. Reset Sync Time (for testing)
```bash
curl -X POST "https://synced-up-call-nmd6n74qt-nicks-projects-f40381ea.vercel.app/api/cron/convoso-sync" \
  -H "Content-Type: application/json" \
  -d '{"office_id": 1, "hours_ago": 24}'
```

## Verification Steps

1. **Check Tables Exist** (in Supabase Dashboard):
   ```sql
   SELECT * FROM sync_state;
   SELECT * FROM convoso_sync_status ORDER BY started_at DESC LIMIT 10;
   ```

2. **Check Sync is Working**:
   - Visit `/admin/convoso-sync` page
   - Click "Trigger Manual Sync"
   - Check for new calls in the calls table

3. **Monitor Logs**:
   - Check Vercel Function Logs for any errors
   - Look for "[Convoso Sync]" prefixed messages

## Setting Up Automated Sync

### Via Vercel Cron
Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/convoso-sync",
    "schedule": "*/15 * * * *"
  }]
}
```

### Via External Service
Use any cron service to call:
```
GET https://your-domain.vercel.app/api/cron/convoso-sync
Header: x-cron-secret: YOUR_CRON_SECRET
```

## Environment Variables Required

Ensure these are set in Vercel:
- `CONVOSO_AUTH_TOKEN` - Your Convoso API token
- `CRON_SECRET` - Secret for cron endpoints (currently: UYJT1451JBTIKMBUT11K4HH)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access

## Troubleshooting

### If sync fails with 404:
- Verify `CONVOSO_AUTH_TOKEN` is correct
- Check if token has access to recordings endpoint

### If database errors:
- Ensure migration was applied successfully
- Check RLS policies aren't blocking service role

### If no data appears:
- Check if there are calls in Convoso within the sync window
- Try resetting sync time to fetch older data

## Production Checklist

- [x] Fix API endpoint in code
- [x] Fix response parsing
- [ ] Apply database migration
- [ ] Test manual sync
- [ ] Set up cron schedule
- [ ] Monitor first automated sync
- [ ] Verify data appears in dashboard