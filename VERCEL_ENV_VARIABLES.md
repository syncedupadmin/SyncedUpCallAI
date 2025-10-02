# Vercel Environment Variables Setup

## Required Environment Variables for Production

Copy these to your Vercel project settings → Environment Variables

### 🔐 Core Application
```env
APP_URL=https://your-app.vercel.app
NODE_ENV=production
JOBS_SECRET=[generate-long-random-string]
CRON_SECRET=[generate-long-random-string]
```

### 🗄️ Database & Supabase
```env
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]
```

### 💳 Stripe Billing (NEW - REQUIRED)
```env
# Stripe API Keys (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_live_[your-live-key]
STRIPE_PUBLISHABLE_KEY=pk_live_[your-live-key]

# Webhook Secret (get after creating webhook endpoint in Stripe)
STRIPE_WEBHOOK_SECRET=whsec_[your-webhook-secret]

# Stripe Price IDs (create products first in Stripe Dashboard)
NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=price_[starter-price-id]
NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID=price_[growth-price-id]
NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID=price_[scale-price-id]
NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID=price_[enterprise-price-id]

# Site URL for redirects
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
```

### 📞 Convoso Integration
```env
CONVOSO_WEBHOOK_SECRET=[shared-secret-with-convoso]
CONVOSO_AUTH_TOKEN=[your-convoso-api-token]
```

### 🎙️ AI & Transcription Services
```env
# Transcription Services
DEEPGRAM_API_KEY=[your-deepgram-key]

# AI Analysis
OPENAI_API_KEY=sk-[your-openai-key]
ANTHROPIC_API_KEY=sk-ant-[your-anthropic-key]  # Optional fallback
```

### 🔒 Optional Security Settings
```env
REDACTION=false
HIPAA_MODE=false
```

## Setup Steps in Vercel

1. **Go to Vercel Dashboard**
   - Select your project
   - Navigate to Settings → Environment Variables

2. **Add Variables**
   - Click "Add New"
   - For each variable above:
     - Name: Copy the variable name exactly
     - Value: Add your actual value
     - Environment: Select "Production" (and optionally "Preview" and "Development")
   - Click "Save"

3. **Stripe-Specific Setup**

   a. **Get Stripe Keys:**
      - Log into https://dashboard.stripe.com
      - Go to Developers → API keys
      - Copy your Live publishable key and Secret key
      - For testing, use Test mode keys first

   b. **Create Products in Stripe:**
      - Go to Products in Stripe Dashboard
      - Create 3-4 products matching your plans:
        - Starter: $297/month
        - Growth: $597/month
        - Scale: $997/month
        - Enterprise: Custom
      - Copy each Price ID after creation

   c. **Setup Webhook:**
      - In Stripe: Developers → Webhooks
      - Add endpoint: `https://your-app.vercel.app/api/stripe/webhook`
      - Select events:
        - `checkout.session.completed`
        - `customer.subscription.*`
        - `invoice.payment_succeeded`
        - `invoice.payment_failed`
        - `payment_method.attached`
        - `payment_method.detached`
      - Copy the signing secret (starts with `whsec_`)

4. **Supabase Vault Setup (for FDW)**
   ```sql
   -- Run this in Supabase SQL Editor
   INSERT INTO vault.secrets (name, secret)
   VALUES ('stripe_api_key', 'sk_live_your_key_here')
   ON CONFLICT (name) DO UPDATE
   SET secret = EXCLUDED.secret;
   ```

5. **Redeploy After Adding Variables**
   - Trigger a new deployment in Vercel
   - Variables will be available in the new deployment

## Generating Secret Values

For `JOBS_SECRET` and `CRON_SECRET`, generate secure random strings:

**Option 1 - Node.js:**
```javascript
require('crypto').randomBytes(32).toString('hex')
```

**Option 2 - Online:**
Use a password generator to create 32+ character strings

**Option 3 - Command line:**
```bash
openssl rand -hex 32
```

## Testing Your Configuration

After deployment, test:

1. **Webhook Test:**
   ```bash
   curl -X POST https://your-app.vercel.app/api/stripe/webhook \
     -H "Content-Type: application/json" \
     -H "stripe-signature: test" \
     -d '{"test": true}'
   ```
   Should return 400 (invalid signature)

2. **Billing Page:**
   - Navigate to `/dashboard/billing`
   - Should load without errors

3. **Checkout Flow:**
   - Try to subscribe to a plan
   - Should redirect to Stripe Checkout

## Environment Variable Priority

Variables are loaded in this order:
1. `.env.production` (if exists)
2. `.env.local` (for local development)
3. Vercel Environment Variables (in production)

## Security Notes

⚠️ **NEVER commit these to Git:**
- Any key starting with `sk_`, `whsec_`, or containing `SECRET`
- Database URLs with passwords
- Service role keys

✅ **Safe to commit:**
- Variables starting with `NEXT_PUBLIC_`
- App URLs
- Feature flags (REDACTION, HIPAA_MODE)

## Troubleshooting

**"Missing environment variable" errors:**
- Check exact variable names (case-sensitive)
- Ensure no trailing spaces
- Redeploy after adding variables

**Stripe webhook failing:**
- Verify webhook secret matches exactly
- Check endpoint URL is correct
- Ensure `/api/*` routes aren't blocked by middleware

**Database connection issues:**
- Verify DATABASE_URL format
- Check Supabase project is not paused
- Ensure service role key is correct

---

Save this file for reference when setting up your Vercel deployment!