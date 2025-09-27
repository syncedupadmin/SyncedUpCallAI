# Strategic Implementation Guide: Commercial SaaS Security
**Date**: 2025-09-27
**Timeline**: 2-3 days (6-9 hours of focused work)
**Risk Level**: Low (fully reversible at each step)

---

## 🎯 Strategy: Small Bites, Test Everything, Ship Fast

**Philosophy**: Fix one thing, test it, commit it, move on. No "big bang" deployments.

**Key Principles**:
1. ✅ **Work incrementally** - One route at a time
2. ✅ **Test immediately** - Before moving to next fix
3. ✅ **Commit frequently** - Easy rollback if needed
4. ✅ **Deploy to staging first** - Catch issues before prod
5. ✅ **Monitor closely** - Watch for errors

---

## 📅 RECOMMENDED SCHEDULE

### Option A: "Sprint Mode" (1 full day)
**Best for**: Dedicated focus, minimal interruptions
- **Morning (4 hours)**: Phase 1 - Fix all 3 routes + test
- **Afternoon (3 hours)**: Phase 2 - Webhooks + test
- **Evening (1-2 hours)**: Phase 3 - Admin routes + deploy to staging

### Option B: "Steady Pace" (3 half-days)
**Best for**: Balancing with other work
- **Day 1 PM**: Phase 1 - Routes (2-3 hours)
- **Day 2 PM**: Phase 2 - Webhooks (2-3 hours)
- **Day 3 AM**: Phase 3 - Admin + Deploy (2 hours)

### Option C: "Evenings Only" (3-4 evenings)
**Best for**: Side project mode
- **Evening 1**: Route 1 + Route 2
- **Evening 2**: Route 3 + Webhooks planning
- **Evening 3**: Webhooks implementation
- **Evening 4**: Admin routes + deployment

**My Recommendation**: Option B (Steady Pace) - gives you time to think between phases

---

## 🚀 IMPLEMENTATION PLAN

### PHASE 1: FIX CRITICAL ROUTES (P0 - BLOCKING)
**Time**: 2-3 hours
**Risk**: Low
**Impact**: Fixes 100% of data leakage

#### Step 1.1: Fix `/api/calls` Route (30 min)

**What we're doing**: Converting raw database query to RLS-enabled Supabase client

**Action Items**:
```bash
# 1. Backup current file
cp src/app/api/calls/route.ts src/app/api/calls/route.ts.backup

# 2. I'll rewrite the file with secure version
# 3. Test locally
# 4. Commit
```

**Testing Checklist**:
- [ ] Start dev server: `npm run dev`
- [ ] Login as test user
- [ ] Visit `/api/calls` endpoint
- [ ] Should see only your agency's calls
- [ ] Check browser console for errors

**Success Criteria**: Returns data, no errors in console

---

#### Step 1.2: Fix `/api/ui/library/simple` Route (30 min)

**What we're doing**: Add agency filtering to best/worst/recent calls

**Testing Checklist**:
- [ ] Visit library page in UI
- [ ] Should see calls from your agency only
- [ ] Best/worst/recent sections populate
- [ ] No errors in console

**Success Criteria**: Library shows data, filtered correctly

---

#### Step 1.3: Fix `/api/ui/call/transcript` Route (20 min)

**What we're doing**: Add access validation before returning transcripts

**Testing Checklist**:
- [ ] Download transcript for your own call → Works
- [ ] Try accessing another agency's call ID → Gets 404
- [ ] Both JSON and TXT formats work

**Success Criteria**: Own transcripts work, others blocked

---

#### Step 1.4: Test Phase 1 Thoroughly (30 min)

**Manual Testing**:
```bash
# Test each fixed route
curl -H "Authorization: Bearer $YOUR_TOKEN" http://localhost:3000/api/calls
curl -H "Authorization: Bearer $YOUR_TOKEN" http://localhost:3000/api/ui/library/simple
curl -H "Authorization: Bearer $YOUR_TOKEN" "http://localhost:3000/api/ui/call/transcript?id=YOUR_CALL_ID"

# All should return 200 OK with data
```

**Commit & Push**:
```bash
git add src/app/api/calls/route.ts
git commit -m "fix: Add agency isolation to /api/calls endpoint

SECURITY: Prevents cross-agency data access
- Convert to withStrictAgencyIsolation wrapper
- Use RLS-enabled Supabase client
- Filter by context.agencyIds"

git add src/app/api/ui/library/simple/route.ts
git commit -m "fix: Add agency filtering to call library

SECURITY: Prevents training data leakage
- Filter best/worst/recent by agency
- Use RLS-enabled queries"

git add src/app/api/ui/call/transcript/route.ts
git commit -m "fix: Add access validation to transcripts

SECURITY: Prevents unauthorized transcript access
- Validate resource ownership
- Return 404 for unauthorized access"

git push origin main
```

**Milestone**: 🎉 **Critical data leakage fixed!**

---

### PHASE 2: WEBHOOK AGENCY ASSIGNMENT (P0 - BLOCKING)
**Time**: 2-3 hours
**Risk**: Low (backwards compatible)
**Impact**: Webhooks create data with correct agency_id

#### Step 2.1: Create Database Migration (20 min)

**What we're doing**: Add `webhook_tokens` table

**Action Items**:
```bash
# Create migration file
# I'll generate the SQL for you
# Then you run: supabase db push
```

**Testing**:
```sql
-- Verify table exists
SELECT * FROM webhook_tokens LIMIT 1;

-- Should return: no rows (empty table is OK)
```

---

#### Step 2.2: Create Webhook Management API (45 min)

**What we're doing**: API to generate/list/revoke webhook tokens

**File to create**: `src/app/api/agencies/[id]/webhooks/route.ts`

**Testing**:
```bash
# Generate token for agency
curl -X POST http://localhost:3000/api/agencies/YOUR_AGENCY_ID/webhooks \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"endpoint_type": "convoso_calls"}'

# Should return: {ok: true, token: {...}, webhook_url: "..."}

# List tokens
curl http://localhost:3000/api/agencies/YOUR_AGENCY_ID/webhooks \
  -H "Authorization: Bearer $YOUR_TOKEN"

# Should return: {ok: true, tokens: [...]}
```

---

#### Step 2.3: Update Webhook Handlers (60 min)

**What we're doing**: Add token authentication to webhook routes

**Files to update**:
- `src/app/api/webhooks/convoso-calls/route.ts`
- `src/app/api/webhooks/convoso/route.ts`

**Key Changes**:
1. Check for `?token=xyz` in URL
2. Look up agency_id from token
3. Set agency_id when creating calls/contacts
4. Keep legacy header auth working (backwards compatible)

**Testing**:
```bash
# Test with token (new method)
curl -X POST "http://localhost:3000/api/webhooks/convoso-calls?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "test-123",
    "agent_name": "Test Agent",
    "disposition": "Success",
    "duration": 120
  }'

# Should return: {ok: true, call_id: "...", agency_id: "..."}

# Test legacy (old method - should still work)
curl -X POST http://localhost:3000/api/webhooks/convoso-calls \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "test-456",
    "agent_name": "Test Agent 2",
    "disposition": "Success",
    "duration": 90
  }'

# Should still work (assigned to first agency)
```

**Verify in Database**:
```sql
-- Check that calls have agency_id
SELECT call_id, agent_name, agency_id
FROM calls
WHERE call_id IN ('test-123', 'test-456');

-- Both should have agency_id set
```

---

#### Step 2.4: Create Default Tokens for Existing Agency (15 min)

**What we're doing**: Backfill tokens for existing agency

**Run Migration**:
```sql
-- Create default tokens for first agency
DO $$
DECLARE
  v_agency_id UUID;
BEGIN
  SELECT id INTO v_agency_id FROM agencies ORDER BY created_at ASC LIMIT 1;

  IF v_agency_id IS NOT NULL THEN
    INSERT INTO webhook_tokens (agency_id, token, endpoint_type, is_active)
    VALUES
      (v_agency_id, encode(gen_random_bytes(32), 'hex'), 'convoso_calls', true),
      (v_agency_id, encode(gen_random_bytes(32), 'hex'), 'convoso_leads', true);
  END IF;
END $$;

-- Get the tokens
SELECT endpoint_type, token,
       CONCAT('https://yourapp.com/api/webhooks/', endpoint_type, '?token=', token) as webhook_url
FROM webhook_tokens
WHERE agency_id = (SELECT id FROM agencies ORDER BY created_at LIMIT 1);
```

**Copy webhook URLs** - you'll need these for Convoso configuration

**Commit**:
```bash
git add supabase/migrations/*_webhook_tokens.sql
git commit -m "feat: Add webhook token system for multi-tenant webhooks

- Create webhook_tokens table
- Add token generation function
- Add agency lookup function"

git add src/app/api/agencies/[id]/webhooks/route.ts
git commit -m "feat: Add webhook token management API

- Generate tokens per agency
- List/revoke tokens
- Protected by agency access control"

git add src/app/api/webhooks/convoso-calls/route.ts
git add src/app/api/webhooks/convoso/route.ts
git commit -m "feat: Add token-based webhook authentication

- Support token in query params
- Assign agency_id to all webhook data
- Backwards compatible with legacy auth
- Log authentication method used"

git push origin main
```

**Milestone**: 🎉 **Webhooks now assign correct agency_id!**

---

### PHASE 3: ADMIN SCOPING (P1 - NICE TO HAVE)
**Time**: 1-2 hours
**Risk**: Very Low
**Impact**: Agency admins see only their data

#### Step 3.1: Update Admin Auth Helper (30 min)

**File to update**: `src/server/auth/admin.ts`

**What we're adding**:
- `getAdminContext()` - Returns user + agencies + super admin status
- `isSuperAdminAuthenticated()` - Checks specifically for super admin
- `forbiddenResponse()` - 403 error for super admin only routes

**Testing**:
```typescript
// In any admin route
const context = await getAdminContext(req);
console.log({
  userId: context.userId,
  isSuperAdmin: context.isSuperAdmin,
  agencyIds: context.agencyIds
});
```

---

#### Step 3.2: Update Admin Routes (45 min)

**File to update**: `src/app/api/admin/calls/route.ts`

**What we're changing**:
```typescript
// BEFORE (shows all agencies):
const calls = await db.manyOrNone(`SELECT * FROM calls LIMIT 500`);

// AFTER (respects agency scope):
const adminContext = await getAdminContext(req);
let filter = '';
let params = [];

if (!adminContext.isSuperAdmin) {
  filter = 'WHERE agency_id = ANY($1)';
  params = [adminContext.agencyIds];
}

const calls = await db.manyOrNone(`
  SELECT * FROM calls ${filter} LIMIT 500
`, params);
```

**Testing**:
```bash
# Test as super admin - should see all
curl -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  http://localhost:3000/api/admin/calls | jq '.data | length'

# Test as agency admin - should see filtered
curl -H "Authorization: Bearer $AGENCY_ADMIN_TOKEN" \
  http://localhost:3000/api/admin/calls | jq '.filtered_by_agencies'
```

**Commit**:
```bash
git add src/server/auth/admin.ts
git commit -m "feat: Add super admin vs agency admin distinction

- Add getAdminContext() for scoped access
- Add isSuperAdminAuthenticated() check
- Add forbiddenResponse() helper"

git add src/app/api/admin/calls/route.ts
# (update other admin routes similarly)
git commit -m "feat: Add agency scoping to admin routes

- Super admins see all agencies
- Agency admins see only their agencies
- Add filtered_by_agencies indicator"

git push origin main
```

**Milestone**: 🎉 **Admin routes properly scoped!**

---

## 🧪 COMPREHENSIVE TESTING PHASE

**Time**: 30-60 minutes
**Critical**: Do this before deploying to production

### Test Scenario 1: Single Agency User

```bash
# Setup: Create test user in your agency
# Login as that user

# Test 1: View calls
# Expected: See your agency's calls only
curl -H "Authorization: Bearer $TOKEN" https://staging.yourapp.com/api/calls

# Test 2: View library
# Expected: Best/worst/recent from your agency
curl -H "Authorization: Bearer $TOKEN" https://staging.yourapp.com/api/ui/library/simple

# Test 3: Download own transcript
# Expected: Success
curl "https://staging.yourapp.com/api/ui/call/transcript?id=YOUR_CALL_ID" \
  -H "Authorization: Bearer $TOKEN"

# Test 4: Try to access another call (if you have another agency)
# Expected: 404 Not Found
curl "https://staging.yourapp.com/api/ui/call/transcript?id=OTHER_AGENCY_CALL_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Test Scenario 2: Webhook Testing

```bash
# Get your webhook token
TOKEN=$(psql $DATABASE_URL -tAc "SELECT token FROM webhook_tokens LIMIT 1")

# Send test webhook
curl -X POST "https://staging.yourapp.com/api/webhooks/convoso-calls?token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "call_id": "final-test-'$(date +%s)'",
    "agent_name": "Test Agent",
    "disposition": "Success",
    "duration": 120,
    "phone_number": "5551234567"
  }'

# Verify in database
psql $DATABASE_URL -c "
  SELECT call_id, agent_name, agency_id,
         (SELECT name FROM agencies WHERE id = calls.agency_id) as agency_name
  FROM calls
  ORDER BY created_at DESC
  LIMIT 1
"

# Expected: Should show the test call with correct agency_id
```

### Test Scenario 3: Admin Scoping

```bash
# Test as super admin
curl -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  https://staging.yourapp.com/api/admin/calls

# Expected: See calls from all agencies

# Test as agency admin
curl -H "Authorization: Bearer $AGENCY_ADMIN_TOKEN" \
  https://staging.yourapp.com/api/admin/calls

# Expected: See only your agency's calls
```

---

## 🚀 DEPLOYMENT STRATEGY

### Pre-Deployment Checklist

- [ ] All Phase 1 routes fixed and tested
- [ ] All Phase 2 webhook updates tested
- [ ] Phase 3 admin routes updated (optional but recommended)
- [ ] Database migrations applied to staging
- [ ] Manual testing completed on staging
- [ ] No errors in console
- [ ] Git commits are clean and well-documented
- [ ] Team notified of deployment

---

### Deployment Steps

#### Step 1: Deploy to Staging (First!)

```bash
# Make sure all changes are committed
git status
# Should show: nothing to commit, working tree clean

# Push to main (triggers Vercel staging deploy)
git push origin main

# Wait for deployment
vercel --prod=false

# Get staging URL
vercel inspect --prod=false
```

#### Step 2: Smoke Test Staging (15 min)

```bash
# Test health
curl https://your-app-staging.vercel.app/api/health

# Test authenticated endpoint
curl -H "Authorization: Bearer $STAGING_TOKEN" \
  https://your-app-staging.vercel.app/api/calls

# Test webhook
curl -X POST "https://your-app-staging.vercel.app/api/webhooks/convoso-calls?token=$STAGING_WEBHOOK_TOKEN" \
  -d '{"call_id":"staging-test","agent_name":"Test","disposition":"Success","duration":60}'

# Check logs for errors
vercel logs --prod=false --follow
```

**If any issues**: Fix, commit, push, test again. **DO NOT PROCEED TO PROD**

---

#### Step 3: Deploy to Production

```bash
# Final check - staging works perfectly
# All tests pass
# No errors in logs

# Deploy to production
vercel --prod

# Get production URL
vercel inspect --prod
```

#### Step 4: Production Smoke Test (10 min)

```bash
# Test production health
curl https://yourapp.com/api/health

# Test authenticated endpoint
curl -H "Authorization: Bearer $PROD_TOKEN" \
  https://yourapp.com/api/calls | jq '.data[0]'

# Expected: Returns call data with agency_id

# Monitor logs for 10 minutes
vercel logs --prod --follow

# Watch for:
# - Any 500 errors
# - Any authentication failures
# - Any database errors
```

---

#### Step 5: Update Convoso Webhook URLs (Per Agency)

**For each agency using the system**:

1. **Get their webhook token**:
```sql
SELECT
  endpoint_type,
  CONCAT('https://yourapp.com/api/webhooks/', endpoint_type, '?token=', token) as webhook_url
FROM webhook_tokens
WHERE agency_id = 'THEIR_AGENCY_ID';
```

2. **Login to Convoso Dashboard**
3. **Navigate to**: Settings → Webhooks
4. **Update webhook URLs** to use new token URLs
5. **Test webhook** (Convoso has "Test Webhook" button)
6. **Verify call appears** in your app with correct agency_id

**Important**: Old webhook URLs (without token) will still work for backwards compatibility, but assign to first agency. Update ASAP.

---

## 📊 POST-DEPLOYMENT MONITORING

### First Hour (Critical)

**Monitor every 5 minutes**:
```bash
# Check error rate
vercel logs --prod | grep ERROR

# Check webhook success rate
psql $DATABASE_URL -c "
  SELECT
    DATE_TRUNC('minute', created_at) as minute,
    COUNT(*) as webhooks_received
  FROM calls
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY minute
  ORDER BY minute DESC
"

# Check user activity
psql $DATABASE_URL -c "
  SELECT COUNT(*) as active_sessions
  FROM auth.sessions
  WHERE created_at > NOW() - INTERVAL '1 hour'
"
```

**Success Metrics** (first hour):
- ✅ Error rate < 1%
- ✅ Webhook success rate > 99%
- ✅ No user complaints
- ✅ Dashboard loads normally

---

### First Day (Important)

**Check once per hour**:
- Error logs for patterns
- Database query performance
- User login success rate
- Webhook processing times

**Run these queries**:
```sql
-- Check agency isolation is working
SELECT
  agency_id,
  COUNT(*) as calls_today
FROM calls
WHERE created_at > CURRENT_DATE
GROUP BY agency_id;

-- All agencies should have separate counts

-- Check for any NULL agency_ids (bad!)
SELECT COUNT(*) as null_agency_calls
FROM calls
WHERE agency_id IS NULL
  AND created_at > CURRENT_DATE;

-- Expected: 0
```

---

### First Week (Validation)

**Daily checks**:
1. Any security incidents? (none expected)
2. Any data leakage reports? (none expected)
3. Webhook success rate? (should be >99%)
4. User satisfaction? (no complaints about missing data)

**End of week review**:
```sql
-- Agency data distribution
SELECT
  a.name as agency_name,
  COUNT(DISTINCT c.id) as total_calls,
  COUNT(DISTINCT t.call_id) as transcribed_calls,
  COUNT(DISTINCT an.call_id) as analyzed_calls
FROM agencies a
LEFT JOIN calls c ON c.agency_id = a.id
LEFT JOIN transcripts t ON t.agency_id = a.id
LEFT JOIN analyses an ON an.agency_id = a.id
WHERE c.created_at > NOW() - INTERVAL '7 days'
GROUP BY a.id, a.name
ORDER BY total_calls DESC;

-- Each agency should have their own data
-- No mixing between agencies
```

---

## 🔄 IF SOMETHING GOES WRONG

### Quick Rollback Procedure

**Scenario**: Production breaks after deployment

**Option 1: Vercel Rollback** (2 minutes)
```bash
# Rollback to previous deployment
vercel rollback

# Or via dashboard: vercel.com → Deployments → Previous → Promote to Production
```

**Option 2: Git Revert** (5 minutes)
```bash
# Revert the commits
git log --oneline -5  # Find the commit to revert to

git revert HEAD~3..HEAD  # Revert last 3 commits

git push origin main

# Vercel auto-deploys
```

**Option 3: Hot Fix** (10-30 minutes)
```bash
# If it's a small bug, fix it quickly
git checkout -b hotfix/production-issue

# Make fix
# Test locally
# Commit

git push origin hotfix/production-issue

# Deploy directly
vercel --prod
```

---

### Common Issues & Solutions

#### Issue 1: "Cannot read property 'agencyIds' of undefined"

**Cause**: User not authenticated properly

**Fix**:
```typescript
// Add null check
if (!context || !context.agencyIds) {
  return NextResponse.json(
    { error: 'Authentication required' },
    { status: 401 }
  );
}
```

---

#### Issue 2: Webhooks fail with "Invalid token"

**Cause**: Token not in database or wrong format

**Debug**:
```sql
-- Check if token exists
SELECT * FROM webhook_tokens WHERE token = 'YOUR_TOKEN';

-- If missing, create one
INSERT INTO webhook_tokens (agency_id, token, endpoint_type)
VALUES (
  (SELECT id FROM agencies LIMIT 1),
  'YOUR_TOKEN',
  'convoso_calls'
);
```

---

#### Issue 3: User sees no calls after deployment

**Cause**: Either no calls in their agency, or agency_id not set

**Debug**:
```sql
-- Check user's agencies
SELECT ua.agency_id, a.name
FROM user_agencies ua
JOIN agencies a ON a.id = ua.agency_id
WHERE ua.user_id = 'USER_ID';

-- Check calls in that agency
SELECT COUNT(*) as call_count
FROM calls
WHERE agency_id = 'THEIR_AGENCY_ID';

-- If 0, check for NULL agency_ids
SELECT COUNT(*) as null_calls
FROM calls
WHERE agency_id IS NULL;
```

**Fix**:
```sql
-- Assign NULL calls to first agency (one-time fix)
UPDATE calls
SET agency_id = (SELECT id FROM agencies ORDER BY created_at LIMIT 1)
WHERE agency_id IS NULL;
```

---

## ✅ SUCCESS CRITERIA

### You'll know it worked when:

1. ✅ **Security Test**: User A cannot access User B's data
2. ✅ **Webhook Test**: New calls have correct agency_id
3. ✅ **Performance Test**: Pages load in < 2 seconds
4. ✅ **Error Test**: Error rate < 0.5%
5. ✅ **User Test**: No complaints about missing data

### Celebration Checklist:

- [ ] All 3 critical routes fixed
- [ ] Webhooks assign correct agency_id
- [ ] Admin routes scoped properly
- [ ] Deployed to production
- [ ] No errors for 24 hours
- [ ] All manual tests pass
- [ ] Team notified of completion

**When all boxes checked**: 🎉 🎊 **You're production-ready with commercial SaaS security!**

---

## 💡 STRATEGIC TIPS

### Do's:
✅ Test each change before moving on
✅ Commit frequently with good messages
✅ Deploy to staging first, always
✅ Monitor logs after deployment
✅ Keep rollback plan handy
✅ Take breaks between phases

### Don'ts:
❌ Skip testing "just this once"
❌ Deploy all changes at once
❌ Deploy on Friday afternoon
❌ Change multiple things if something breaks
❌ Panic - everything is reversible
❌ Rush - better to do it right

---

## 🎯 RECOMMENDED NEXT STEPS

**Right Now**:
1. Read through this guide once more
2. Set aside 3-4 hours of focused time
3. Start with Phase 1, Step 1.1
4. I'll help you implement each route

**Ready to start?** Say:
- "Let's fix /api/calls first"
- "Start Phase 1"
- "I'm ready, let's go"

And I'll give you the exact code for the first fix!

---

**Implementation Guide Created By**: Claude Code
**Status**: Ready to execute
**Confidence**: High (tested strategy, low risk)
**Your Role**: Follow steps, test thoroughly, celebrate success 🎉