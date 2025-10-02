# Manual Migration Instructions

## To enable inline editing of product_type in the super admin portal

The super admin portal now supports inline editing of agency product types. To enable this feature, you need to run the migration in `20250203_update_agency_product_type.sql`.

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the contents of `20250203_update_agency_product_type.sql`
4. Paste and run the SQL

### Option 2: Via Direct Database Connection

If you have direct database access:

```bash
psql $DATABASE_URL -f supabase/migrations/20250203_update_agency_product_type.sql
```

### What This Migration Does

- Creates an RPC function `update_agency_product_type` that allows super admins to change an agency's product type
- Validates that only super admins can use this function
- Ensures product_type is either 'full' or 'compliance_only'
- Returns success/error status with details

### Testing the Feature

After running the migration:

1. Go to the super admin agencies page
2. Click on any product type badge (Full Platform or Compliance Only)
3. Select the new product type from the dropdown
4. Click the checkmark to save or X to cancel

Note: The feature includes a fallback to direct database update if the RPC function doesn't exist, so it will work even before the migration is applied (for super admins only).