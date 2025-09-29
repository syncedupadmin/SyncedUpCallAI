-- =====================================================
-- STRIPE BILLING SYSTEM WITH FOREIGN DATA WRAPPER
-- =====================================================
-- This migration sets up complete Stripe integration using
-- Supabase's Foreign Data Wrapper for real-time data sync
-- =====================================================

-- =====================================================
-- STEP 1: Enable Wrappers Extension
-- =====================================================
-- NOTE: Enable this in Supabase Dashboard: Database > Extensions > Search "wrappers" > Enable
-- Or uncomment below:
-- CREATE EXTENSION IF NOT EXISTS wrappers WITH SCHEMA extensions;

-- =====================================================
-- STEP 2: Store Stripe API Key in Vault
-- =====================================================
-- IMPORTANT: Replace 'sk_test_YOUR_STRIPE_SECRET_KEY' with your actual Stripe secret key
-- Run this and note the key_id returned:
/*
INSERT INTO vault.secrets (name, secret)
VALUES ('stripe_api_key', 'sk_test_YOUR_STRIPE_SECRET_KEY')
ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret
RETURNING key_id;
*/

-- =====================================================
-- STEP 3: Create Foreign Data Wrapper
-- =====================================================
-- NOTE: This may already exist if wrappers extension is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_foreign_data_wrapper WHERE fdwname = 'stripe_wrapper'
  ) THEN
    CREATE FOREIGN DATA WRAPPER stripe_wrapper
      HANDLER stripe_fdw_handler
      VALIDATOR stripe_fdw_validator;
  END IF;
END $$;

-- =====================================================
-- STEP 4: Create Foreign Server
-- =====================================================
-- IMPORTANT: Replace 'YOUR_KEY_ID_FROM_VAULT' with the key_id from Step 2
/*
DROP SERVER IF EXISTS stripe_server CASCADE;
CREATE SERVER stripe_server
FOREIGN DATA WRAPPER stripe_wrapper
OPTIONS (
  api_key_id 'YOUR_KEY_ID_FROM_VAULT',
  api_url 'https://api.stripe.com/v1/',
  api_version '2024-06-20'
);
*/

-- =====================================================
-- STEP 5: Create Private Stripe Schema
-- =====================================================
-- SECURITY: This schema should NOT be exposed to the API
CREATE SCHEMA IF NOT EXISTS stripe;

-- Grant usage to authenticated users (for internal functions only)
GRANT USAGE ON SCHEMA stripe TO authenticated;

-- =====================================================
-- STEP 6: Import Stripe Tables
-- =====================================================
-- NOTE: Uncomment and run after setting up the server with your API key
/*
IMPORT FOREIGN SCHEMA stripe
LIMIT TO (
  customers,
  subscriptions,
  products,
  prices,
  invoices,
  checkout_sessions,
  payment_methods,
  charges,
  payment_intents
)
FROM SERVER stripe_server
INTO stripe;
*/

-- =====================================================
-- STEP 7: Create Local Billing Tables
-- =====================================================

-- Agency subscriptions table
CREATE TABLE IF NOT EXISTS public.agency_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status TEXT CHECK (status IN (
    'trialing',
    'active',
    'canceled',
    'past_due',
    'incomplete',
    'incomplete_expired',
    'paused',
    'unpaid'
  )),
  plan_name TEXT,
  plan_tier TEXT CHECK (plan_tier IN ('starter', 'growth', 'scale', 'enterprise', 'custom')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_agency_subscription UNIQUE (agency_id)
);

-- Usage records for metered billing
CREATE TABLE IF NOT EXISTS public.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.agency_subscriptions(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL CHECK (metric_name IN (
    'calls_processed',
    'minutes_transcribed',
    'api_calls',
    'storage_gb',
    'team_members'
  )),
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_amount DECIMAL(10, 2),
  total_amount DECIMAL(10, 2),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  reported_to_stripe BOOLEAN DEFAULT false,
  stripe_usage_record_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_usage_record UNIQUE (agency_id, metric_name, period_start, period_end)
);

-- Billing events log
CREATE TABLE IF NOT EXISTS public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  stripe_event_id TEXT UNIQUE,
  processed BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment methods cache
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT UNIQUE,
  type TEXT,
  last4 TEXT,
  brand TEXT,
  exp_month INTEGER,
  exp_year INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- STEP 8: Create Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_agency_subscriptions_agency ON public.agency_subscriptions(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_subscriptions_status ON public.agency_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_agency_subscriptions_stripe_customer ON public.agency_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_agency_period ON public.usage_records(agency_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_usage_records_reported ON public.usage_records(reported_to_stripe) WHERE reported_to_stripe = false;
CREATE INDEX IF NOT EXISTS idx_billing_events_agency ON public.billing_events(agency_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_unprocessed ON public.billing_events(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_payment_methods_agency ON public.payment_methods(agency_id);

-- =====================================================
-- STEP 9: Enable Row Level Security
-- =====================================================
ALTER TABLE public.agency_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 10: Create RLS Policies
-- =====================================================

-- Agency subscriptions policies
DROP POLICY IF EXISTS "Users can view their agency subscription" ON public.agency_subscriptions;
CREATE POLICY "Users can view their agency subscription"
  ON public.agency_subscriptions FOR SELECT
  TO authenticated
  USING (
    agency_id IN (
      SELECT agency_id FROM public.user_agencies
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.agency_subscriptions;
CREATE POLICY "Service role can manage subscriptions"
  ON public.agency_subscriptions FOR ALL
  TO service_role
  USING (true);

-- Usage records policies
DROP POLICY IF EXISTS "Users can view their agency usage" ON public.usage_records;
CREATE POLICY "Users can view their agency usage"
  ON public.usage_records FOR SELECT
  TO authenticated
  USING (
    agency_id IN (
      SELECT agency_id FROM public.user_agencies
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage usage" ON public.usage_records;
CREATE POLICY "Service role can manage usage"
  ON public.usage_records FOR ALL
  TO service_role
  USING (true);

-- Payment methods policies
DROP POLICY IF EXISTS "Users can view their payment methods" ON public.payment_methods;
CREATE POLICY "Users can view their payment methods"
  ON public.payment_methods FOR SELECT
  TO authenticated
  USING (
    agency_id IN (
      SELECT agency_id FROM public.user_agencies
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Service role can manage payment methods" ON public.payment_methods;
CREATE POLICY "Service role can manage payment methods"
  ON public.payment_methods FOR ALL
  TO service_role
  USING (true);

-- =====================================================
-- STEP 11: Create Secure Access Functions
-- =====================================================

-- Function to safely get Stripe customer data
CREATE OR REPLACE FUNCTION public.get_stripe_customer(p_agency_id UUID)
RETURNS TABLE (
  id TEXT,
  email TEXT,
  name TEXT,
  created TIMESTAMP,
  balance INTEGER,
  currency TEXT,
  delinquent BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check user has access to this agency
  IF NOT EXISTS (
    SELECT 1 FROM public.user_agencies
    WHERE agency_id = p_agency_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Return customer data from Stripe FDW
  RETURN QUERY
  SELECT c.id, c.email, c.name, c.created, c.balance, c.currency, c.delinquent
  FROM stripe.customers c
  JOIN public.agency_subscriptions s ON s.stripe_customer_id = c.id
  WHERE s.agency_id = p_agency_id
  LIMIT 1;
END;
$$;

-- Function to get Stripe subscription details
CREATE OR REPLACE FUNCTION public.get_stripe_subscription(p_agency_id UUID)
RETURNS TABLE (
  id TEXT,
  status TEXT,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN,
  trial_start TIMESTAMP,
  trial_end TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check user has access to this agency
  IF NOT EXISTS (
    SELECT 1 FROM public.user_agencies
    WHERE agency_id = p_agency_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Return subscription data from Stripe FDW
  RETURN QUERY
  SELECT
    s.id,
    s.status,
    s.current_period_start,
    s.current_period_end,
    s.cancel_at_period_end,
    s.trial_start,
    s.trial_end
  FROM stripe.subscriptions s
  JOIN public.agency_subscriptions asub ON asub.stripe_subscription_id = s.id
  WHERE asub.agency_id = p_agency_id
  LIMIT 1;
END;
$$;

-- Function to track usage
CREATE OR REPLACE FUNCTION public.track_usage(
  p_agency_id UUID,
  p_metric_name TEXT,
  p_quantity INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- Get current billing period
  v_period_start := date_trunc('month', CURRENT_DATE)::DATE;
  v_period_end := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Insert or update usage record
  INSERT INTO public.usage_records (
    agency_id,
    metric_name,
    quantity,
    period_start,
    period_end
  ) VALUES (
    p_agency_id,
    p_metric_name,
    p_quantity,
    v_period_start,
    v_period_end
  )
  ON CONFLICT (agency_id, metric_name, period_start, period_end)
  DO UPDATE SET
    quantity = usage_records.quantity + EXCLUDED.quantity,
    updated_at = NOW();
END;
$$;

-- Function to check subscription status
CREATE OR REPLACE FUNCTION public.check_subscription_status(p_agency_id UUID)
RETURNS TABLE (
  is_active BOOLEAN,
  is_trialing BOOLEAN,
  days_left_in_trial INTEGER,
  plan_tier TEXT,
  can_access_features BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get subscription details
  SELECT * INTO v_subscription
  FROM public.agency_subscriptions
  WHERE agency_id = p_agency_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false::BOOLEAN AS is_active,
      false::BOOLEAN AS is_trialing,
      0::INTEGER AS days_left_in_trial,
      NULL::TEXT AS plan_tier,
      false::BOOLEAN AS can_access_features;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_subscription.status = 'active' AS is_active,
    v_subscription.status = 'trialing' AS is_trialing,
    CASE
      WHEN v_subscription.trial_end IS NOT NULL
      THEN GREATEST(0, EXTRACT(DAY FROM v_subscription.trial_end - NOW())::INTEGER)
      ELSE 0
    END AS days_left_in_trial,
    v_subscription.plan_tier AS plan_tier,
    v_subscription.status IN ('active', 'trialing') AS can_access_features;
END;
$$;

-- =====================================================
-- STEP 12: Grant Permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION public.get_stripe_customer TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stripe_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_subscription_status TO authenticated;

-- =====================================================
-- STEP 13: Create Update Triggers
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agency_subscriptions_updated_at
  BEFORE UPDATE ON public.agency_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =====================================================
-- MIGRATION INSTRUCTIONS
-- =====================================================
-- 1. Enable wrappers extension in Supabase Dashboard
-- 2. Add your Stripe secret key to Vault (uncomment Step 2)
-- 3. Create the foreign server with your key_id (uncomment Step 4)
-- 4. Import Stripe tables (uncomment Step 6)
-- 5. The rest will run automatically

-- To verify setup:
-- SELECT * FROM stripe.customers LIMIT 1;
-- SELECT * FROM public.check_subscription_status('your-agency-id');