# Stripe Billing Setup Guide

## Overview
Complete Stripe billing implementation for SyncedUp AI using Supabase Foreign Data Wrapper.

## Prerequisites
1. Stripe account with API keys
2. Supabase project with admin access
3. Vercel deployment configured

## Setup Steps

### 1. Stripe Dashboard Configuration

#### Create Products & Prices
1. Log into Stripe Dashboard
2. Navigate to Products
3. Create the following products:

**Starter Plan ($297/month)**
- Product Name: SyncedUp AI Starter
- Price: $297/month
- Billing: Recurring monthly
- Save the Price ID

**Growth Plan ($597/month)**
- Product Name: SyncedUp AI Growth
- Price: $597/month
- Billing: Recurring monthly
- Save the Price ID

**Scale Plan ($997/month)**
- Product Name: SyncedUp AI Scale
- Price: $997/month
- Billing: Recurring monthly
- Save the Price ID

**Enterprise Plan (Custom pricing)**
- Product Name: SyncedUp AI Enterprise
- Price: Custom (contact sales)
- Save the Price ID if created

#### Configure Webhook
1. Go to Developers → Webhooks
2. Add endpoint: `https://your-domain.com/api/stripe/webhook`
3. Select events to listen for:
   - checkout.session.completed
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - customer.subscription.trial_will_end
   - invoice.payment_succeeded
   - invoice.payment_failed
   - payment_method.attached
   - payment_method.detached
4. Copy the webhook signing secret

#### Configure Customer Portal
1. Go to Settings → Billing → Customer portal
2. Enable the portal
3. Configure allowed actions:
   - Update payment methods
   - Cancel subscriptions
   - View invoices
   - Update billing address

### 2. Supabase Configuration

#### Run Migration
1. Go to SQL Editor in Supabase Dashboard
2. Run the migration from `supabase/migrations/20250929_stripe_billing_setup.sql`
3. This creates:
   - Stripe Foreign Data Wrapper
   - Local billing tables
   - Secure access functions

#### Store Stripe API Key in Vault
```sql
-- Store your Stripe secret key securely
INSERT INTO vault.secrets (name, secret)
VALUES ('stripe_api_key', 'sk_live_your_key_here')
ON CONFLICT (name) DO UPDATE
SET secret = EXCLUDED.secret;
```

### 3. Environment Variables

Add to your `.env.local`:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Stripe Price IDs
NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID=price_xxx
NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID=price_xxx

# Site URL
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### 4. Vercel Deployment

Add environment variables in Vercel:
1. Go to Project Settings → Environment Variables
2. Add all the variables from `.env.local`
3. Deploy the application

### 5. Testing

#### Test Checkout Flow
1. Use Stripe test keys
2. Create a test agency account
3. Navigate to /dashboard/billing
4. Select a plan and complete checkout
5. Use test card: 4242 4242 4242 4242

#### Test Webhook
```bash
# Install Stripe CLI
stripe login

# Forward webhooks to local
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Trigger test event
stripe trigger checkout.session.completed
```

#### Verify Subscription
1. Check Stripe Dashboard for subscription
2. Check Supabase `agency_subscriptions` table
3. Verify user can access protected routes

## Architecture

### Data Flow
1. User initiates checkout → Creates Stripe session
2. Payment completed → Webhook received
3. Webhook handler → Updates local database
4. Middleware → Checks subscription status
5. FDW → Syncs data from Stripe when needed

### Security
- Stripe API key stored in Supabase Vault
- Webhook signature verification
- Row Level Security on billing tables
- Secure RPC functions for FDW access

### Key Components
- `/api/stripe/checkout` - Creates checkout sessions
- `/api/stripe/webhook` - Handles Stripe events
- `/api/stripe/portal` - Customer portal access
- `/dashboard/billing` - Billing management UI
- `middleware.ts` - Subscription enforcement

## Troubleshooting

### Common Issues

**Webhook not receiving events**
- Verify endpoint URL in Stripe
- Check webhook signing secret
- Ensure API routes are not blocked by middleware

**Subscription not syncing**
- Check webhook logs in Stripe Dashboard
- Verify database connection
- Check error logs in `billing_events` table

**Trial enforcement not working**
- Verify middleware is deployed
- Check subscription status in database
- Ensure trial_end dates are set correctly

**Foreign Data Wrapper errors**
- Verify Stripe API key in vault
- Check FDW server configuration
- Ensure postgres_fdw extension is enabled

## Monitoring

### Database Tables to Monitor
- `agency_subscriptions` - Subscription status
- `billing_events` - Webhook event log
- `payment_methods` - Customer payment methods

### Key Metrics
- Active subscriptions by plan
- Trial conversion rate
- Failed payments
- Churn rate

### Alerts to Configure
- Failed webhook events
- Expired trials
- Failed payments
- Subscription cancellations

## Support
For billing issues, check:
1. Stripe Dashboard logs
2. Supabase logs
3. Vercel function logs
4. Application error tracking