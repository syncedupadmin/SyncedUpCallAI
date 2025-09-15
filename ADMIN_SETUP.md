# Admin Authentication Setup

## Setting Up Admin Users (No Hardcoding!)

### Method 1: Using Supabase SQL Editor

1. **Run the admin setup SQL** in Supabase:
   - Go to SQL Editor in your Supabase dashboard
   - Run the contents of `supabase/admin-setup.sql`

2. **Add your admin user**:
   ```sql
   -- Replace with your actual admin email
   SELECT public.add_admin_user('your-email@example.com');
   ```

3. **Create the account**:
   - Sign up at `/signup` with the email you added
   - Login at `/login` with your credentials

### Method 2: Direct Database Update

1. **Sign up first** at `/signup` with any email
2. **Update role in Supabase**:
   - Go to Table Editor → `profiles` table
   - Find your user by email
   - Change `role` from 'user' to 'admin'

## Features

### Regular Users
- Access to `/dashboard`
- View call analytics
- Standard user features

### Admin Users
- Users with 'admin' role in the profiles table
- Can access `/admin/super` portal
- Full access to super admin portal
- User management capabilities
- System configuration access

## Authentication Flow

1. **Login Page**: `/login`
   - Pre-filled with admin email for convenience
   - Secure password authentication
   - "Forgot Password" functionality

2. **Signup Page**: `/signup`
   - Create new accounts
   - Admin account gets elevated privileges automatically

3. **Protected Routes**:
   - `/dashboard` - Requires authentication
   - `/admin/super` - Requires admin authentication
   - `/calls`, `/analytics`, `/reports` - Requires authentication

## Security Notes

- Admin email (`admin@syncedupsolutions.com`) is hardcoded for security
- Admin users are automatically detected and given elevated privileges
- Session management handled by Supabase Auth
- Secure cookie-based authentication for admin portal

## Troubleshooting

### Can't login?
1. Check that you've created the account at `/signup`
2. Verify your email if required
3. Ensure you're using the correct password

### Not redirecting to admin portal?
1. Make sure you're logging in with `admin@syncedupsolutions.com`
2. Clear browser cookies and try again
3. Check browser console for errors

### Forgot password?
1. Click "Forgot password?" on the login page
2. Enter your email
3. Check your inbox for the reset link