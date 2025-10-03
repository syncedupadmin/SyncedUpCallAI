# Manual Migration Instructions

## To enable inline editing of product_type in the super admin portal

The super admin portal now supports inline editing of agency product types. To enable this feature fully, you need to run the migration.

## IMPORTANT: Apply BOTH Migrations to Fix All Issues

### ⚠️ NEW: Fix Realtime Subscription Error

If you're seeing this error:
```
"Unable to subscribe to changes with given parameters. Please check Realtime is enabled"
```

**Run this first** in SQL Editor:
```sql
-- Enable Realtime for agencies table
ALTER PUBLICATION supabase_realtime ADD TABLE public.agencies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_agencies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
```

Then continue with the main migration below.

## Main Migration: Fix Product Type Updates

### Run the Complete Migration (Required)

1. **Go to your Supabase Dashboard**: https://supabase.com/dashboard
2. **Navigate to SQL Editor**
3. **Copy ALL contents of** `20250203_complete_product_type_setup.sql`
4. **Paste and click "Run"**

This migration includes:
- ✅ RLS policies for the agencies table
- ✅ RPC function for secure product_type updates
- ✅ Proper permissions for super admins
- ✅ Audit logging support

### Alternative: Quick Fix (if main migration fails)

If the complete migration has issues, run this minimal version:

```sql
-- Enable direct updates for super admins (temporary workaround)
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do anything" ON public.agencies
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
```

### What This Migration Does

1. **Enables Row Level Security** on the agencies table
2. **Creates RLS policies** that allow:
   - All users to view their agencies
   - Super admins to update any agency's product_type
   - Agency owners to update their own agencies
3. **Creates the RPC function** `update_agency_product_type` for secure updates
4. **Grants proper permissions** to authenticated users

### Testing the Feature

After running the migration:

1. Go to https://aicall.syncedupsolutions.com/superadmin/agencies
2. Click on any product type badge (Full Platform or Compliance Only)
3. Select the new product type from the dropdown
4. Click ✓ to save or ✕ to cancel

### Troubleshooting

If updates still don't work:

1. **Check you're logged in as super admin**
   - Run this in SQL Editor: `SELECT public.is_super_admin();`
   - Should return `true`

2. **Verify RLS is enabled**
   - Run: `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'agencies';`
   - Should show `rowsecurity = true`

3. **Check the browser console** for any error messages

4. **Use the fallback**: The UI includes a fallback to direct database updates that should work for super admins even without the migration

### Production Verification

After applying to production, verify with:

```sql
-- Check if function exists
SELECT proname FROM pg_proc WHERE proname = 'update_agency_product_type';

-- Check if RLS policies exist
SELECT polname FROM pg_policy WHERE polrelid = 'agencies'::regclass;

-- Test the function (replace with real agency ID)
SELECT public.update_agency_product_type(
  'your-agency-id-here'::uuid,
  'compliance_only'
);
```