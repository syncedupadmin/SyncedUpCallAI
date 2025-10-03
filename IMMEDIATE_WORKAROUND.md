# 🚨 IMMEDIATE FIX - DO THIS NOW!

## Option 1: Fix in Supabase (BEST)
1. Go to Supabase SQL Editor
2. Paste and run **URGENT_FIX_400_ERROR.sql**
3. Done! Your app works

## Option 2: Quick Frontend Workaround (If SQL doesn't work)

Replace the RPC call in AgencyCreateCard.tsx temporarily:

```typescript
// INSTEAD OF:
const { data: agency, error } = await supabase
  .rpc('create_agency_with_owner', {
    p_name: data.name,
    p_product_type: data.product_type || 'full'
  })
  .single()

// USE THIS DIRECT INSERT:
const { data: agency, error } = await supabase
  .from('agencies')
  .insert({
    name: data.name,
    slug: data.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
    owner_user_id: (await supabase.auth.getUser()).data.user?.id,
    product_type: data.product_type || 'full',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  .select()
  .single()
```

## Option 3: Super Quick Manual Creation

If all else fails, create the agency directly in Supabase Dashboard:

1. Go to Supabase Dashboard → Table Editor → agencies
2. Click "Insert row"
3. Fill in:
   - name: Your client's agency name
   - slug: (auto-generated or type one)
   - product_type: compliance_only
   - owner_user_id: (copy from an existing agency or user)
4. Save

Then they can log in and use it!

## The 400 Error Cause:
The function was returning TABLE format but Supabase API expected a single RECORD. The fix changes the return type to match what Supabase expects.