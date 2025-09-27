# API Security Audit - Production Readiness Report
**Date**: 2025-09-27
**Status**: ⚠️ CRITICAL SECURITY ISSUES FOUND

## Executive Summary

After comprehensive analysis of all API endpoints from the perspective of:
1. **New Agency** signing up and using the portal
2. **Agent** from that agency viewing their data

**VERDICT**: 🔴 **NOT PRODUCTION READY** - Critical data leakage vulnerabilities found

---

## 🔴 CRITICAL SECURITY VIOLATIONS

### 1. `/api/calls/route.ts` - COMPLETE DATA LEAKAGE
**Severity**: CRITICAL
**Lines**: 22-44
**Issue**: Returns ALL calls from database without ANY agency filtering

```typescript
// CURRENT CODE - BROKEN:
const calls = await db.manyOrNone(`
  SELECT * FROM calls c
  LEFT JOIN agents a ON a.id = c.agent_id
  WHERE c.source = 'convoso'
  ORDER BY c.started_at DESC
  LIMIT 100
`);
```

**Impact**:
- Any authenticated user from Agency A can see ALL calls from Agency B, C, D, etc.
- Complete breach of multi-tenant isolation
- Violates HIPAA/PII requirements

**Fix Required**:
```typescript
export const GET = withStrictAgencyIsolation(async (req, context) => {
  const supabase = createSecureClient();
  const { data: calls } = await supabase
    .from('calls')
    .select('*, agents(name)')
    .in('agency_id', context.agencyIds)
    .eq('source', 'convoso')
    .order('started_at', { ascending: false })
    .limit(100);
  // ...
});
```

---

### 2. `/api/ui/library/simple/route.ts` - CROSS-AGENCY DATA ACCESS
**Severity**: CRITICAL
**Lines**: 9-80
**Issue**: Returns best/worst/recent calls from ALL agencies

```typescript
// CURRENT CODE - BROKEN:
const best = await db.manyOrNone(`
  SELECT * FROM calls c
  WHERE c.disposition IN ('Completed', 'Success')
  ORDER BY an.qa_score DESC NULLS LAST
  LIMIT 20
`);
// NO agency_id filtering!
```

**Impact**:
- Agency A can see Agency B's "best calls" for training
- Competitive intelligence leakage
- Customer data exposure

**Fix Required**: Add `withStrictAgencyIsolation` wrapper and use RLS-enabled Supabase client

---

### 3. `/api/ui/call/transcript/route.ts` - UNAUTHORIZED TRANSCRIPT ACCESS
**Severity**: CRITICAL
**Lines**: 16-26
**Issue**: Any user can access any transcript by ID

```typescript
// CURRENT CODE - BROKEN:
const result = await db.oneOrNone(`
  SELECT t.*, c.started_at, c.duration_sec
  FROM transcripts t
  JOIN calls c ON c.id = t.call_id
  WHERE t.call_id = $1
`, [id]);
// NO agency ownership check!
```

**Impact**:
- Agent from Agency A can export transcripts from Agency B
- HIPAA violation if health data is discussed
- Complete PII exposure

**Fix Required**: Must validate `agency_id` matches user's agencies before returning data

---

## 🟠 HIGH SEVERITY ISSUES

### 4. Webhooks Create Data Without Agency Assignment

#### `/api/webhooks/convoso/route.ts` - Contact Creation
**Lines**: 55-56
**Issue**: Creates contacts without `agency_id`
```typescript
await db.upsert('contacts', leadData, 'lead_id');
// leadData has no agency_id field!
```

#### `/api/webhooks/convoso-calls/route.ts` - Call Creation
**Lines**: 118-153
**Issue**: Hardcodes `office_id = 1`, no `agency_id`
```typescript
office_id,      // Hardcoded to 1
1,              // Default office_id
'convoso'
// WHERE IS AGENCY_ID?
```

**Impact**:
- New calls/contacts are orphaned or assigned to wrong agency
- Webhook from Agency B's Convoso could create calls under Agency A
- Data corruption in multi-tenant environment

**Fix Required**:
1. Webhooks need to include agency identifier (API key, subdomain, etc.)
2. Look up agency_id based on webhook source
3. Always set agency_id when creating records

---

### 5. Cron Jobs Process Cross-Agency Data

#### `/api/cron/process-recordings-v3/route.ts`
**Lines**: 183-198
**Issue**: Updates calls without agency context
```typescript
const callRecord = await db.oneOrNone(`
  UPDATE calls
  SET recording_url = $1
  WHERE call_id = $2
  RETURNING id
`, [recordingUrl, job.call_id]);
// Processes ALL pending recordings regardless of agency
```

#### `/api/cron/process-transcription-queue/route.ts`
**Lines**: 23-25
**Issue**: Fetches next transcription job from ALL agencies
```typescript
const job = await db.oneOrNone(`
  SELECT * FROM get_next_transcription_job()
`);
// Function doesn't filter by agency
```

**Impact**:
- Cron jobs work correctly but mix agency data
- Could cause one agency's quota to be used by another
- Background processing is agency-agnostic

**Fix Required**: These are OK as-is (system-level operations), but should log agency context

---

### 6. Admin Routes Use Raw Database Without Agency Filtering

#### `/api/admin/calls/route.ts`
**Lines**: 15-42
**Issue**: Returns ALL calls (500) across agencies
```typescript
const calls = await db.manyOrNone(`
  SELECT * FROM calls c
  WHERE 1=1  -- No agency filter!
  ORDER BY c.created_at DESC
  LIMIT 500
`);
```

**Impact**:
- Admin routes are protected by `isAdminAuthenticated()`
- BUT this checks for "admin" role, not "super admin"
- Agency admin from Agency A could see Agency B's calls

**Fix Required**:
1. Use middleware to check `is_super_admin()` for cross-agency access
2. OR filter by admin's agency: `WHERE agency_id = ANY($1)`

---

## 🟡 MEDIUM SEVERITY ISSUES

### 7. Search Endpoint Uses Raw Database for Vector Queries
**File**: `/api/ui/search/route.ts`
**Lines**: 39-68
**Status**: ✅ CORRECTLY SECURED with `withStrictAgencyIsolation` and `agency_id` filtering

**Note**: This is one of the few routes that correctly:
- Uses `withStrictAgencyIsolation` wrapper
- Filters by `c.agency_id = ANY($4)` in SQL
- Uses raw `db` connection (necessary for pgvector operations)

---

### 8. Missing Agency Onboarding Flow

**Issue**: No API endpoints for:
- Agency signup/registration (`/api/agencies/create`)
- Agency settings management (`/api/agencies/[id]`)
- Convoso webhook configuration per agency
- Initial admin user setup

**Impact**:
- New agencies must be manually created in database
- No self-service onboarding
- Support burden for each new customer

**Fix Required**: Create agency management endpoints

---

### 9. User Preferences Not Persisted
**File**: `/api/user-prefs/route.ts`
**Lines**: 4-12
**Issue**: TODO comments, returns defaults only

```typescript
export async function GET() {
  // TODO: read from your DB by user/org
  return NextResponse.json(DEFAULT_PREFS);
}
```

**Impact**:
- Users can't customize their experience
- Settings don't persist across sessions

---

### 10. SuperAdmin Invite Works But No Bulk Operations
**File**: `/api/superadmin/invite-and-add/route.ts`
**Status**: ✅ WORKS - Correctly uses service role
**Gap**: No bulk user import, CSV upload, or agent management UI

---

## 🟢 CORRECTLY SECURED ENDPOINTS

These endpoints follow proper security patterns:

### ✅ `/api/ui/stats/route.ts`
- Uses `withStrictAgencyIsolation`
- Uses `createSecureClient()`
- Filters all queries by `context.agencyIds`

### ✅ `/api/ui/calls/route.ts`
- Uses `withStrictAgencyIsolation`
- Uses RLS-enabled Supabase client
- Proper pagination

### ✅ `/api/ui/call/[id]/route.ts`
- Uses `withStrictAgencyIsolation`
- Validates resource access with `validateResourceAccess()`
- Double-checks agency_id in query

---

## USER JOURNEY ANALYSIS

### 🎭 Scenario 1: New Agency Signup

**Current State**: ❌ BROKEN
**Steps**:
1. User visits app → How do they sign up? No endpoint!
2. Super admin must manually:
   - Create agency in database
   - Create user via `/api/superadmin/invite-and-add`
   - User receives email
3. User logs in → Which agency? How is it determined?

**What's Missing**:
- [ ] `/api/agencies` - Create new agency
- [ ] `/api/agencies/[id]` - Get/update agency settings
- [ ] `/api/agencies/[id]/webhook-config` - Configure Convoso webhook
- [ ] Onboarding wizard UI
- [ ] Payment/plan selection

---

### 🎭 Scenario 2: Agency Admin Logs In

**Current State**: ⚠️ PARTIALLY WORKS
**Steps**:
1. ✅ Login via Supabase Auth works
2. ✅ Middleware redirects to `/dashboard`
3. ⚠️ Dashboard loads data from `/api/ui/stats` → WORKS (secured)
4. ❌ Clicks "Calls" → `/api/calls` → SEES ALL AGENCIES' DATA!
5. ❌ Views call library → `/api/ui/library/simple` → CROSS-AGENCY DATA!

**Critical Issue**: Agent can access other agencies' sensitive data

---

### 🎭 Scenario 3: Agent Views Their Calls

**Current State**: ⚠️ PARTIALLY WORKS
**Steps**:
1. ✅ Login works
2. ✅ Views dashboard metrics (filtered correctly)
3. ✅ Views paginated calls list from `/api/ui/calls` → WORKS
4. ✅ Clicks individual call `/api/ui/call/[id]` → WORKS (validates access)
5. ❌ Downloads transcript `/api/ui/call/transcript?id=X` → CAN ACCESS ANY TRANSCRIPT!

**Critical Issue**: Agent can export competitors' call transcripts by guessing IDs

---

### 🎭 Scenario 4: Convoso Webhook Fires

**Current State**: ❌ BROKEN
**Steps**:
1. Convoso sends webhook to `/api/webhooks/convoso-calls`
2. ⚠️ Webhook secret validated → OK
3. ❌ Call created with `office_id = 1`, no `agency_id` → WRONG AGENCY!
4. ❌ Contact created without `agency_id` → ORPHANED!
5. 🤷 Background cron processes recording → Which agency pays for it?

**Critical Issue**: Webhooks don't know which agency they belong to

**Fix Required**:
- Option A: Each agency gets unique webhook URL with token: `/api/webhooks/convoso?agency=uuid&token=secret`
- Option B: Convoso sends agency identifier in payload
- Option C: Map Convoso account ID to agency_id in config table

---

## PRIORITIZED FIX LIST

### 🔥 P0 - BLOCK PRODUCTION LAUNCH

1. **Fix `/api/calls/route.ts`** - Add agency isolation (30 min)
2. **Fix `/api/ui/library/simple/route.ts`** - Add agency filtering (30 min)
3. **Fix `/api/ui/call/transcript/route.ts`** - Validate agency ownership (20 min)
4. **Fix webhook agency assignment** - Add agency_id to webhook handlers (2 hours)
5. **Test cross-agency data access** - Verify isolation with 2 test agencies (1 hour)

**Total**: ~4.5 hours to make production-safe

---

### 🟠 P1 - LAUNCH WEEK 1

6. **Create agency management endpoints** (4 hours)
   - POST `/api/agencies` - Create agency
   - GET/PUT `/api/agencies/[id]` - Manage settings
   - POST `/api/agencies/[id]/webhook-token` - Generate webhook token

7. **Build agency onboarding flow** (8 hours)
   - Signup page
   - Agency creation wizard
   - Webhook configuration guide
   - First user invitation

8. **Implement user preferences persistence** (2 hours)
   - Create `user_preferences` table
   - Update `/api/user-prefs` to read/write

9. **Add admin scoping** (3 hours)
   - Distinguish super admin vs agency admin
   - Filter admin routes by agency for agency admins

---

### 🟡 P2 - MONTH 1

10. **Bulk user management** (4 hours)
    - CSV import for agents
    - Bulk invite API
    - Role management UI

11. **Agency usage tracking** (6 hours)
    - Track API calls per agency
    - Monitor ASR/AI costs per agency
    - Usage dashboard for super admin

12. **Audit logging** (4 hours)
    - Log cross-agency access attempts
    - Track data exports
    - Security event dashboard

---

## TESTING CHECKLIST

Before production launch, verify:

- [ ] Create Agency A with user A1
- [ ] Create Agency B with user B1
- [ ] User A1 logs in
  - [ ] Can see only Agency A's calls
  - [ ] Cannot access Agency B's call by ID
  - [ ] Cannot download Agency B's transcript
  - [ ] Search only returns Agency A's calls
  - [ ] Dashboard stats only show Agency A
- [ ] User B1 logs in
  - [ ] Sees different data than User A1
  - [ ] All queries return 0 overlap with Agency A
- [ ] Send webhook to Agency A's endpoint
  - [ ] Call appears for Agency A
  - [ ] Call does NOT appear for Agency B
- [ ] Cron jobs run
  - [ ] Process recordings for both agencies
  - [ ] Don't mix up agency data

---

## RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data breach via `/api/calls` | HIGH | CRITICAL | Must fix before launch |
| Transcript leak via ID enumeration | HIGH | HIGH | Add access validation |
| Webhook assigns to wrong agency | MEDIUM | HIGH | Implement agency mapping |
| Agent sees competitor data | HIGH | CRITICAL | Fix library endpoint |
| Cron job cost attribution wrong | LOW | MEDIUM | Add agency logging |
| No way to onboard new agencies | HIGH | MEDIUM | Build signup flow |

---

## RECOMMENDED DEPLOYMENT PLAN

### Phase 1: Security Fixes (DO NOT DEPLOY WITHOUT THIS)
```bash
# 1. Fix critical data leakage routes
# 2. Test with 2 agencies
# 3. Run security verification script
npm run security:verify

# 4. Deploy to staging
vercel deploy

# 5. Penetration test
# 6. Deploy to production
vercel --prod
```

### Phase 2: Agency Onboarding (Week 1)
```bash
# 1. Create agency management APIs
# 2. Build signup flow
# 3. Deploy
```

### Phase 3: Admin Improvements (Week 2-4)
```bash
# 1. Agency admin vs super admin
# 2. Usage tracking
# 3. Audit logs
```

---

## FILES REQUIRING IMMEDIATE CHANGES

1. `src/app/api/calls/route.ts` - **REWRITE COMPLETELY**
2. `src/app/api/ui/library/simple/route.ts` - **ADD AGENCY FILTERING**
3. `src/app/api/ui/call/transcript/route.ts` - **ADD ACCESS VALIDATION**
4. `src/app/api/webhooks/convoso-calls/route.ts` - **ADD AGENCY_ID LOGIC**
5. `src/app/api/webhooks/convoso/route.ts` - **ADD AGENCY_ID TO CONTACTS**

---

## CONCLUSION

**Current State**: The database-level RLS policies are correctly configured and working. However, multiple API routes bypass RLS by using the raw `db` connection, creating critical security vulnerabilities.

**Root Cause**: Inconsistent security patterns. Some routes (new ones) use `withStrictAgencyIsolation`, but older routes use raw database access.

**Recommendation**:
1. **DO NOT LAUNCH** until P0 fixes are complete
2. Audit every route using `db.` and convert to `createSecureClient()`
3. Establish coding standards: "NEVER use raw db for user-facing queries"
4. Add automated security tests that verify cross-agency isolation

**Estimated Time to Production-Ready**: 4-6 hours of focused work

---

**Audit Completed By**: Claude Code
**Next Steps**: Review findings with team, prioritize P0 fixes, schedule security retest