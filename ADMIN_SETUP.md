# Admin Authentication Setup

## Quick Setup

1. **Navigate to the signup page**: `/signup`

2. **Create the admin account** with these credentials:
   - Email: `admin@syncedupsolutions.com`
   - Password: Choose a strong password (minimum 6 characters)
   - Name: Admin (or your preferred name)

3. **Verify your email** (if email verification is enabled in Supabase)

4. **Login** at `/login` with:
   - Email: `admin@syncedupsolutions.com`
   - Your chosen password

## Features

### Regular Users
- Access to `/dashboard`
- View call analytics
- Standard user features

### Admin User (admin@syncedupsolutions.com)
- Automatically redirected to `/admin/super` after login
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