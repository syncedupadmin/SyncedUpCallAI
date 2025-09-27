# 🔒 Supabase Multi-Tenant Security Deployment Guide

## Overview

This guide walks you through applying complete multi-tenant isolation to your Supabase database. The application-level security is already implemented - now we need to match it at the database level with Row-Level Security (RLS).

## ⚠️ CRITICAL: Why This is Necessary

**Current State**: Your application code enforces agency isolation, but the database layer doesn't yet have RLS on all tables.

**Risk**: If someone bypasses your application (direct database access, SQL injection, compromised credentials), they could access all agencies' data.

**Solution**: Apply database-level RLS policies that match your application security.

---

## Pre-Deployment Checklist

- [ ] Backup your Supabase database
- [ ] Have Supabase dashboard access
- [ ] Verify you're in a maintenance window (migration takes ~5-10 minutes)
- [ ] Have at least 2 test users from different agencies ready

---

## Step 1: Backup Current Database

### Option A: Through Supabase Dashboard
1. Go to **Supabase Dashboard** → **Database** → **Backups**
2. Click **Create Backup** (if available in your plan)
3. Note the backup ID

### Option B: Using pg_dump
```bash
# Get your connection string from Supabase Dashboard → Settings → Database
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres" \
  -f backup_before_isolation_$(date +%Y%m%d_%H%M%S).sql
```

---

## Step 2: Audit Current State

Run the audit script to understand current database state:

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Open `scripts/audit-supabase-schema.sql`
3. Copy and paste the entire contents
4. Click **Run**

**Expected Output**: You'll see which tables already have `agency_id` and RLS enabled.

**Example Output**:
```
✅ calls - Has agency_id, RLS Enabled
❌ transcripts - MISSING agency_id
❌ analyses - MISSING agency_id
❌ contacts - MISSING agency_id
```

---

## Step 3: Apply Database Migration

### Method 1: Supabase SQL Editor (Recommended)

1. Open **Supabase Dashboard** → **SQL Editor**
2. Create a new query
3. Copy the contents of `supabase/migrations/20250926230735_enforce_complete_multi_tenant_isolation.sql`
4. Paste into SQL Editor
5. Click **Run**

**Monitor the output for**:
- ✅ Success notices for each table
- Any errors (stop if you see errors)
- Final verification report

### Method 2: Supabase CLI

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push

# Verify
supabase db diff
```

### Method 3: Direct psql Connection

```bash
# Get connection string from Supabase Dashboard → Settings → Database
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres" \
  -f supabase/migrations/20250926230735_enforce_complete_multi_tenant_isolation.sql
```

---

## Step 4: Verify Migration Success

After running the migration, you should see output like:

```
✅ Added agency_id to transcripts table
✅ Added agency_id to analyses table
✅ Added agency_id to contacts table
✅ Added agency_id to agents table
✅ Added agency_id to call_events table
✅ Added agency_id to transcript_embeddings table

========================================
MULTI-TENANT ISOLATION VERIFICATION
========================================

✅ Tables with agency_id: 7 / 7
✅ Tables with RLS enabled: 7 / 7
✅ Tables with RLS policies: 7 / 7

🎉 SUCCESS: Complete multi-tenant isolation configured!
```

If you don't see this, check for errors in the SQL output.

---

## Step 5: Run Database Isolation Tests

Now test the isolation with actual users:

### Test Setup
You need 2 users from different agencies:
- User A from Agency A
- User B from Agency B

### Run Tests

1. **Login as User A** in your application
2. Get their auth token from browser DevTools (Application → Cookies → `sb-access-token`)
3. Go to **Supabase Dashboard** → **SQL Editor**
4. Run the test script: `scripts/test-database-isolation.sql`

**Expected Results for User A**:
```
=== Current User Agency Access ===
agency_id: [Agency A UUID]
agency_name: Agency A
unique_agencies: 1

=== Calls Visibility Test ===
total_calls_visible: 150
unique_agencies: 1
test_result: ✅ PASS: Only one agency visible

=== Transcripts Visibility Test ===
total_transcripts_visible: 120
unique_agencies: 1
test_result: ✅ PASS: Only one agency visible
```

4. **Login as User B** and repeat the test
5. Verify User B only sees Agency B data

### ❌ FAILURE INDICATORS

If you see:
```
unique_agencies: 2 or more
test_result: ❌ FAIL: Multiple agencies visible to regular user
```

**Stop immediately** and check:
- Did the migration complete successfully?
- Are you testing with a super admin account (they see all data)?
- Run the audit script again to verify RLS is enabled

---

## Step 6: Test Through Application

### Frontend Test
1. **Login as User A** → Navigate to Calls page
   - Should see only Agency A calls
   - Note the count

2. **Login as User B** → Navigate to Calls page
   - Should see only Agency B calls
   - Count should be different

3. **Try Cross-Agency Access** (as User A):
   - Get a call ID from Agency B (from super admin view or database)
   - Try to access: `/calls/[AGENCY_B_CALL_ID]`
   - **Expected**: 404 or "Call not found"

### API Test
```bash
# Get User A's auth token
TOKEN_A="[User A token from browser DevTools]"

# Get User B's call ID from database
CALL_ID_B="[UUID of a call from Agency B]"

# Try to access Agency B call as User A (should fail)
curl https://your-app.vercel.app/api/ui/call?id=$CALL_ID_B \
  -H "Cookie: sb-access-token=$TOKEN_A"

# Expected: {"ok":false,"error":"call_not_found"}
```

---

## Step 7: Enable Audit Logging

Your migration created a `security_audit_log` table. Enable logging:

```sql
-- Enable audit logging for sensitive operations
CREATE OR REPLACE FUNCTION public.log_cross_agency_attempt()
RETURNS TRIGGER AS $$
BEGIN
    -- Log when someone tries to access data from wrong agency
    IF NEW.agency_id != (
        SELECT agency_id
        FROM user_agencies
        WHERE user_id = auth.uid()
        LIMIT 1
    ) THEN
        INSERT INTO security_audit_log (
            user_id,
            agency_id,
            action,
            resource_type,
            resource_id,
            success,
            error_message
        ) VALUES (
            auth.uid(),
            NEW.agency_id,
            'CROSS_AGENCY_ATTEMPT',
            TG_TABLE_NAME,
            NEW.id::TEXT,
            false,
            'User attempted to access data from different agency'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Troubleshooting

### Issue: Migration fails with "column already exists"
**Solution**: Some tables already have `agency_id`. This is fine - the migration handles this with `IF NOT EXISTS` checks.

### Issue: Migration fails with "cannot add NOT NULL column"
**Solution**: You have orphaned data (e.g., transcripts with no matching call). Options:
1. Delete orphaned data: `DELETE FROM transcripts WHERE call_id NOT IN (SELECT id FROM calls)`
2. Create a default agency first, then re-run migration

### Issue: Users see empty data after migration
**Possible causes**:
1. RLS is too strict - check policies
2. `user_agencies` table not populated correctly
3. User doesn't have agency assignment

**Diagnosis**:
```sql
-- Check user's agency assignments
SELECT * FROM user_agencies WHERE user_id = auth.uid();

-- Check if is_super_admin() function works
SELECT is_super_admin();

-- Temporarily check data exists
SET LOCAL role TO postgres;
SELECT COUNT(*) FROM calls;
```

### Issue: Super admin sees no data
**Cause**: `is_super_admin()` function not working
**Solution**:
```sql
-- Check function exists
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'is_super_admin';

-- Test function
SELECT is_super_admin();

-- If missing, create it
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND role = 'SUPER_ADMIN'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

---

## Rollback Plan

If something goes wrong and you need to revert:

```sql
-- EMERGENCY ROLLBACK (use with caution)

-- Disable RLS temporarily
ALTER TABLE public.transcripts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_embeddings DISABLE ROW LEVEL SECURITY;

-- Drop policies
DROP POLICY IF EXISTS "Users can view transcripts from their agencies" ON public.transcripts;
-- ... (repeat for all policies)

-- Restore from backup
-- psql [connection] < backup_before_isolation_YYYYMMDD_HHMMSS.sql
```

---

## Post-Deployment Monitoring

### Daily Checks (First Week)

1. **Check for security violations**:
```sql
SELECT *
FROM security_audit_log
WHERE success = false
AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

2. **Verify agency data counts**:
```sql
SELECT
    agency_id,
    COUNT(*) as calls_count
FROM calls
GROUP BY agency_id;
```

3. **Monitor application errors**: Check Vercel logs for 403/404 errors

### Weekly Checks

1. Run `scripts/audit-supabase-schema.sql` to verify RLS still enabled
2. Run `scripts/test-database-isolation.sql` with test users
3. Review security audit log for patterns

---

## Success Criteria

✅ **Database Level**:
- All 7 tables have `agency_id` column
- All 7 tables have RLS enabled
- All 7 tables have SELECT/INSERT/UPDATE policies
- Audit log table created

✅ **Application Level**:
- User A cannot see User B's data
- API returns 404 for cross-agency access
- Frontend shows only user's agency data
- Super admin sees all data

✅ **Compliance Level**:
- HIPAA: PHI isolated by organization
- SOC2: Access controls documented
- GDPR: Customer data properly scoped

---

## Additional Resources

- **Supabase RLS Guide**: https://supabase.com/docs/guides/auth/row-level-security
- **Application Security**: See `src/lib/security/agency-isolation.ts`
- **Verification Script**: Run `npx ts-node scripts/verify-security-isolation.ts`

---

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review Supabase logs in Dashboard → Logs
3. Check application logs in Vercel
4. Run the audit script to diagnose state

**Emergency Contact**: Your database/DevOps team

---

## Final Checklist

Before marking this complete:

- [ ] Database backup created
- [ ] Migration applied successfully
- [ ] All 7 tables have agency_id
- [ ] All 7 tables have RLS enabled
- [ ] Tested with 2+ users from different agencies
- [ ] Verified cross-agency access blocked
- [ ] Super admin access working
- [ ] Application security verification passing (32/32 checks)
- [ ] Audit logging enabled
- [ ] Monitoring in place

---

**Migration Date**: _____________
**Verified By**: _____________
**Production Deployment**: ⬜ Approved ⬜ Blocked

**Notes**:
```
[Add any deployment-specific notes here]
```