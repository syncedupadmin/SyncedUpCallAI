# Supabase Authentication Setup Guide

## Quick Fix for 401 Error

The 401 Unauthorized error occurs when Supabase authentication is not properly configured. Follow these steps:

## 1. Configure Supabase Project

### Go to Supabase Dashboard
1. Visit [Supabase Dashboard](https://supabase.com/dashboard/project/sbvxvheirbjwfbqjreor)
2. Navigate to **Authentication** → **Providers**

### Enable Email Authentication
1. Click on **Email** provider
2. Ensure these settings are configured:
   - **Enable Email Signup**: ✅ Enabled
   - **Confirm Email**: Can be disabled for testing
   - **Secure Email Change**: ✅ Enabled
   - **Secure Password Change**: ✅ Enabled

### Configure Auth Settings
1. Go to **Authentication** → **URL Configuration**
2. Add your site URL to **Site URL**:
   ```
   https://synced-up-call-ai.vercel.app
   ```
3. Add to **Redirect URLs**:
   ```
   https://synced-up-call-ai.vercel.app/**
   http://localhost:3000/**
   ```

## 2. Run Database Setup

1. Go to **SQL Editor** in Supabase Dashboard
2. Copy and run the contents of `supabase/setup.sql`
3. This creates:
   - User profiles table
   - Admin role assignment
   - Automatic profile creation on signup

## 3. Configure Email Templates (Optional)

1. Go to **Authentication** → **Email Templates**
2. Customize the confirmation email if needed
3. Update the redirect URL in templates to:
   ```
   https://synced-up-call-ai.vercel.app/login
   ```

## 4. Test Authentication

### Create Admin Account:
1. Visit https://synced-up-call-ai.vercel.app/signup
2. Sign up with:
   - Email: `admin@syncedupsolutions.com`
   - Password: Your secure password
3. If email confirmation is enabled, check your email
4. Login at https://synced-up-call-ai.vercel.app/login

### Troubleshooting 401 Errors:

#### Check Rate Limiting
- Supabase has rate limits on auth endpoints
- Default: 30 requests per hour for signups
- Go to **Authentication** → **Rate Limits** to adjust

#### Check API Keys
- Verify the anon key in Vercel matches Supabase:
  - Supabase: **Settings** → **API** → **Project API keys**
  - Should match `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel

#### Check Project Status
- Ensure your Supabase project is not paused
- Free tier projects pause after 7 days of inactivity
- Go to **Settings** → **General** to unpause

## 5. Common Issues and Solutions

### "Invalid API key" Error
- Double-check the API keys in Vercel environment variables
- Ensure no extra spaces or quotes in the values

### "Email not confirmed" Error
1. Go to **Authentication** → **Users** in Supabase
2. Find the user and manually confirm their email
3. Or disable email confirmation in settings for testing

### "User already registered" Error
1. Go to **Authentication** → **Users**
2. Delete the existing user
3. Try signing up again

### Cannot Login After Signup
1. Check if email confirmation is required
2. Check spam folder for confirmation email
3. Manually confirm user in Supabase dashboard

## 6. Security Considerations

For production:
1. Enable email confirmation
2. Set up proper email templates
3. Configure rate limiting
4. Use strong passwords
5. Enable 2FA for admin accounts (optional)

## Need Help?

1. Check Supabase logs: **Logs** → **Auth**
2. Check browser console for detailed errors
3. Verify all environment variables are set correctly
4. Ensure Supabase project is active (not paused)