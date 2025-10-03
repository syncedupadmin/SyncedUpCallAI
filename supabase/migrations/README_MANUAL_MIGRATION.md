# Manual Migration Instructions

## 🚀 FINAL FIX - Apply This One Migration

### The Issue
- Product type changes weren't persisting
- Realtime subscription errors
- RLS policies preventing updates

### The Solution - Run This Migration

1. **Go to your Supabase Dashboard**: https://supabase.com/dashboard
2. **Navigate to SQL Editor**
3. **Copy ALL contents of** `20250203_final_product_type_fix.sql`
4. **Paste and click "Run"**

### What This Migration Does

✅ **Fixes all issues at once:**
- Enables Realtime on agencies, user_agencies, and profiles tables
- Creates proper RLS policies with correct USING/WITH CHECK clauses
- Adds a trigger to enforce update scope (super admins can update all fields)
- Maintains updated_at timestamps for change tracking
- Creates RPC function for secure product_type updates
- Grants necessary permissions


### Testing the Feature

After running the migration:

1. Go to https://aicall.syncedupsolutions.com/superadmin/agencies
2. Click on any product type badge (Full Platform or Compliance Only)
3. Select the new product type from the dropdown
4. Click ✓ to save or ✕ to cancel
5. The change should persist and appear immediately

### Verification Queries

Run these in SQL Editor to verify the migration worked:

```sql
-- 1. Check Realtime is enabled
SELECT * FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename='agencies';

-- 2. Check RLS policies exist
SELECT polname FROM pg_policy
WHERE polrelid = 'agencies'::regclass;

-- 3. Verify you're a super admin
SELECT public.is_super_admin();
-- Should return: true

-- 4. Test the RPC function (replace with real agency ID)
SELECT public.update_agency_product_type(
  'your-agency-id-here'::uuid,
  'compliance_only'
);
```

### If Issues Persist

Contact support with:
- The error message from browser console
- Results of the verification queries above
- Your Supabase project URL