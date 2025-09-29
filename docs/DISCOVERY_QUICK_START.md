# Discovery System Quick Start Guide

## 🚀 Quick Setup (5 Minutes)

### Step 1: Set Encryption Key

**Generate the key:**
```bash
openssl rand -hex 32
```

**Add to local environment:**
```bash
# .env.local
ENCRYPTION_KEY=4ee18d29d909cefa0a6be8c912715b2fe7b52293a1b1430dceab40a1db89ce86
```

**Add to Vercel (production):**
```bash
vercel env add ENCRYPTION_KEY production
# Paste the generated key when prompted
```

⚠️ **CRITICAL:** Never commit this key to Git! It's already in `.env.local.example` as a placeholder.

---

### Step 2: Run Database Migration

**Option A: Supabase CLI**
```bash
supabase db push
```

**Option B: Direct SQL**
```bash
psql $DATABASE_URL < supabase/migrations/20250929_agency_discovery_flow.sql
```

**Option C: Supabase Dashboard**
1. Go to SQL Editor
2. Paste contents of `supabase/migrations/20250929_agency_discovery_flow.sql`
3. Run

**Verify:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'agencies' AND column_name = 'discovery_status';
-- Should return: discovery_status
```

---

### Step 3: Test the Flow

**Create a test agency:**
1. Go to `/register`
2. Fill in company details
3. Submit (creates agency with `discovery_status='pending'`)

**First login:**
1. Login with test account
2. Should redirect to `/dashboard/discovery`
3. Enter Convoso credentials (use real credentials for testing)
4. Click "Start Discovery Analysis"
5. Should redirect to `/dashboard/discovery/results`
6. Watch progress bar update every 2 seconds
7. When complete, click "Continue to Dashboard"

**Second login:**
1. Logout and login again
2. Should go directly to `/dashboard` (discovery already completed)

---

## 🎯 Testing Scenarios

### Scenario 1: Happy Path (2,500 calls available)
```
✅ Register → Login → Discovery setup → Enter credentials → Processing → Results → Dashboard
```

### Scenario 2: Insufficient Data (< 100 calls)
```
✅ Register → Login → Discovery setup → Enter credentials → Skip message → Dashboard
```

### Scenario 3: Invalid Credentials
```
✅ Discovery setup → Enter wrong credentials → Error → Retry (3 attempts) → Skip option
```

### Scenario 4: Skip Discovery
```
✅ Discovery setup → Retry 3 times → Click "Skip" → Dashboard access granted
```

---

## 🔍 Verification Checklist

- [ ] `ENCRYPTION_KEY` set in production Vercel env
- [ ] Database migration applied successfully
- [ ] RLS policies active (check with `SELECT * FROM pg_policies WHERE tablename = 'discovery_sessions';`)
- [ ] Test agency can complete discovery flow
- [ ] Second login skips discovery (goes to dashboard)
- [ ] Agency A cannot access Agency B's discovery session (RLS working)
- [ ] Build passes (`npm run build` - ignore pre-existing Stripe error)

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "ENCRYPTION_KEY not set" error | Add to `.env.local` and restart dev server |
| Discovery stuck at "pulling" | Check Convoso API credentials in browser console |
| "Session not found" | Verify RLS policies applied with SQL query above |
| Redirect loop | Check `discovery_status` in agencies table is 'completed' |
| TypeScript errors | Run `npx tsc --noEmit` - should show 0 errors |

---

## 📊 Monitor These

**Server logs to watch:**
```bash
# Successful flow
[Discovery] Starting for agency {uuid}
[Discovery] Fetching 2,500 calls in 25 chunks
[Discovery] Completed successfully

# Failed flow
[Discovery] Error for agency {uuid}: {error}
```

**Database queries:**
```sql
-- Active discoveries
SELECT agency_id, status, progress, processed, total_calls
FROM discovery_sessions
WHERE status IN ('pulling', 'analyzing')
ORDER BY started_at DESC;

-- Recent completions
SELECT a.name, ds.processed, ds.metrics->>'closeRate' as close_rate
FROM agencies a
JOIN discovery_sessions ds ON ds.agency_id = a.id
WHERE ds.status = 'complete'
ORDER BY ds.completed_at DESC
LIMIT 10;
```

---

## 🚨 Production Deployment

**Before deploying:**
1. ✅ Set `ENCRYPTION_KEY` in Vercel (all environments)
2. ✅ Run migration on production database
3. ✅ Test with staging/preview deployment first
4. ✅ Monitor first 3 production discoveries closely
5. ✅ Have rollback plan ready (migrations are additive, safe to leave)

**Rollback if needed:**
```sql
-- Revert migration (only if critical issues)
ALTER TABLE agencies DROP COLUMN IF EXISTS discovery_status;
ALTER TABLE agencies DROP COLUMN IF EXISTS discovery_session_id;
ALTER TABLE agencies DROP COLUMN IF EXISTS convoso_credentials;
ALTER TABLE discovery_sessions DROP COLUMN IF EXISTS agency_id;
```

---

## 📞 Support

**For issues:**
1. Check server logs for `[Discovery]` entries
2. Query `discovery_sessions` table for session status
3. Verify environment variables set correctly
4. Check RLS policies with `SELECT * FROM pg_policies`

**Common fixes:**
- Restart Vercel deployment if env vars just added
- Clear browser cache if redirect loop occurs
- Re-run migration if columns missing

---

## 🎉 Success Indicators

You'll know it's working when:
- New agencies see discovery setup page on first login
- Progress bar updates smoothly during processing
- Results page shows actual metrics from Convoso data
- Second login bypasses discovery entirely
- Different agencies can't see each other's sessions

---

**Estimated Setup Time:** 5 minutes
**Estimated Test Time:** 10 minutes
**Total Time to Production:** 15 minutes

Ready to deploy! 🚀