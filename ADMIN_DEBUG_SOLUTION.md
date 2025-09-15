# Admin Dashboard Access Debug Solution

## Problem Identified

The admin dashboard access is failing because of a **function signature mismatch** in the `is_admin()` database function.

### Root Cause

1. **Database Function**: The `is_admin()` function expects a `user_email` parameter:
   ```sql
   CREATE OR REPLACE FUNCTION public.is_admin(user_email TEXT)
   ```

2. **Code Implementation**: All calls in the codebase call the function **without parameters**:
   ```typescript
   const { data: isAdmin } = await supabase.rpc('is_admin');
   ```

3. **Result**: The function receives `NULL` for the email parameter and always returns `false`.

## Files Affected

- `/src/lib/auth/admin.ts` (lines 12, 63)
- `/src/middleware.ts` (line 31)
- `/src/app/login/page.tsx` (line 38)
- `/src/app/api/auth/admin/route.ts` (lines 38, 118)
- `/src/app/(dashboard)/calls/page.tsx` (line 42)

## Solution Steps

### Step 1: Fix the Database Function

Run the SQL script to fix the `is_admin()` function:

```bash
# Connect to your Supabase database and run:
psql -f supabase/fix-admin-function.sql
```

Or execute the SQL manually in your Supabase dashboard:

```sql
-- Create new is_admin function that gets current user automatically
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  current_user_email TEXT;
BEGIN
  -- Get the current authenticated user's email
  SELECT email INTO current_user_email
  FROM auth.users
  WHERE id = auth.uid();

  -- If no authenticated user, return false
  IF current_user_email IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if email exists in admin_users table OR has admin role in profiles
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE email = current_user_email
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE email = current_user_email AND role = 'admin'
  ) OR current_user_email = 'admin@syncedupsolutions.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Step 2: Ensure Admin User is Set Up

Make sure `admin@syncedupsolutions.com` is in the `admin_users` table:

```sql
-- Add admin user if not exists
INSERT INTO public.admin_users (email, user_id, created_by)
VALUES (
  'admin@syncedupsolutions.com',
  (SELECT id FROM auth.users WHERE email = 'admin@syncedupsolutions.com'),
  (SELECT id FROM auth.users WHERE email = 'admin@syncedupsolutions.com')
) ON CONFLICT (email) DO NOTHING;

-- Ensure profile has admin role
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'admin@syncedupsolutions.com' AND role != 'admin';
```

### Step 3: Verify Environment Variables

Ensure the following environment variables are set:

```env
ADMIN_SECRET=your-secure-admin-secret-here
ADMIN_EMAIL=admin@syncedupsolutions.com
```

### Step 4: Debug and Test

1. **Use the debug script**: Load `/debug-admin.js` in your browser console after logging in
2. **Check the results** and follow the recommendations

### Step 5: Clear Cache and Retry

1. **Clear browser cache** and cookies
2. **Sign out and sign back in** with `admin@syncedupsolutions.com`
3. **Check admin access** at `/admin/super`

## Additional Debugging

If the issue persists after applying the fix:

### Check Database Records

```sql
-- Check if user exists in auth.users
SELECT id, email FROM auth.users WHERE email = 'admin@syncedupsolutions.com';

-- Check if user is in admin_users table
SELECT * FROM public.admin_users WHERE email = 'admin@syncedupsolutions.com';

-- Check user profile
SELECT * FROM public.profiles WHERE email = 'admin@syncedupsolutions.com';

-- Test the function manually
SELECT public.is_admin();
```

### Check Middleware Issues

The middleware at `/src/middleware.ts` has two checks:
1. `is_admin()` function result
2. `admin-auth` cookie must match `ADMIN_SECRET`

Make sure both pass:
- Fix the `is_admin()` function (Step 1)
- Ensure `ADMIN_SECRET` environment variable is set

### Environment Variable Check

In your production environment (Vercel/Netlify), verify:
- `ADMIN_SECRET` is set and matches what's expected
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct
- Database connection variables are properly configured

## Expected Behavior After Fix

1. User logs in with `admin@syncedupsolutions.com`
2. `is_admin()` function returns `true`
3. Admin cookie is set by `/api/auth/admin`
4. Middleware allows access to `/admin/*` routes
5. User can access admin dashboard at `/admin/super`

## Prevention

To prevent this issue in the future:
1. Always test function signatures match the calling code
2. Add unit tests for admin authentication flow
3. Use TypeScript to catch parameter mismatches
4. Document function signatures in code comments