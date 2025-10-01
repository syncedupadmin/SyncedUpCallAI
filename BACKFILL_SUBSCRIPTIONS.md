# Backfill Trial Subscriptions

## Problem
Users who registered **before** the auto-subscription feature was deployed (commit 5124cfa) don't have trial subscriptions, causing them to be redirected to billing when trying to use discovery.

Additionally, users who previously tried discovery but had insufficient data (< 100 calls) have their `discovery_status` set to 'skipped', which prevents them from accessing discovery even after backfilling subscriptions.

## Solution
Run the backfill script to:
1. Create trial subscriptions for agencies without one
2. Reset `discovery_status` from 'skipped' to 'pending' for affected agencies

## Option 1: Via API Endpoint (Recommended - Once Deployed)

Wait for Vercel to finish deploying, then run:

```bash
curl -X POST https://aicall.syncedupsolutions.com/api/admin/backfill-subscriptions \
  -H "Authorization: Bearer UYJT1451JBTIKMBUT11K4HH" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "message": "Backfilled X trial subscriptions",
  "count": X,
  "agencies": [...]
}
```

## Option 2: Via SQL (Immediate)

Run this SQL directly in Supabase SQL Editor:

```sql
-- Backfill trial subscriptions for agencies without one
INSERT INTO public.agency_subscriptions (
  agency_id,
  status,
  plan_tier,
  plan_name,
  trial_start,
  trial_end,
  current_period_start,
  current_period_end,
  metadata
)
SELECT
  a.id as agency_id,
  'trialing' as status,
  'starter' as plan_tier,
  '14-Day Free Trial' as plan_name,
  NOW() as trial_start,
  NOW() + INTERVAL '14 days' as trial_end,
  NOW() as current_period_start,
  NOW() + INTERVAL '14 days' as current_period_end,
  jsonb_build_object(
    'created_via', 'manual_backfill',
    'auto_created', true,
    'backfilled_at', NOW()
  ) as metadata
FROM public.agencies a
LEFT JOIN public.agency_subscriptions sub ON sub.agency_id = a.id
WHERE sub.id IS NULL
  AND a.created_at > NOW() - INTERVAL '30 days'
ON CONFLICT (agency_id) DO NOTHING;

-- Reset discovery_status to 'pending' for agencies with 'skipped' status
-- This allows them to retry discovery with their new trial subscription
UPDATE public.agencies
SET discovery_status = 'pending'
WHERE discovery_status = 'skipped'
  AND created_at > NOW() - INTERVAL '30 days'
  AND id IN (
    SELECT agency_id FROM public.agency_subscriptions
    WHERE metadata->>'created_via' = 'manual_backfill'
  );
```

## How to Access Supabase SQL Editor

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" in the left sidebar
4. Click "+ New Query"
5. Paste the SQL above
6. Click "Run" or press Cmd/Ctrl + Enter

## Verification

After running, you can verify:

```sql
-- Check how many subscriptions were created
SELECT
  COUNT(*) as total_subscriptions,
  COUNT(*) FILTER (WHERE metadata->>'created_via' IN ('backfill_api', 'manual_backfill')) as backfilled
FROM public.agency_subscriptions;
```

## After Backfill

Users should now be able to:
1. Access discovery flow without billing redirect
2. Complete discovery onboarding
3. See their trial subscription in billing page
4. Have 14 days before trial expires
