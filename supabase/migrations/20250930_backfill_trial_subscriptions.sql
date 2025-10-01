-- Backfill trial subscriptions for agencies that don't have one
-- This handles agencies created before the auto-subscription feature was added

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
    'created_via', 'backfill_migration',
    'auto_created', true,
    'backfilled_at', NOW()
  ) as metadata
FROM public.agencies a
LEFT JOIN public.agency_subscriptions sub ON sub.agency_id = a.id
WHERE sub.id IS NULL  -- Only agencies without a subscription
  AND a.created_at > NOW() - INTERVAL '30 days'  -- Only recent agencies (last 30 days)
ON CONFLICT (agency_id) DO NOTHING;  -- Skip if subscription exists (race condition protection)

-- Reset discovery_status to 'pending' for agencies with 'skipped' status
-- This allows them to retry discovery with their new trial subscription
UPDATE public.agencies
SET discovery_status = 'pending'
WHERE discovery_status = 'skipped'
  AND created_at > NOW() - INTERVAL '30 days'
  AND id IN (
    SELECT agency_id FROM public.agency_subscriptions
    WHERE metadata->>'created_via' = 'backfill_migration'
  );

-- Log how many were backfilled
DO $$
DECLARE
  backfilled_count INTEGER;
  reset_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backfilled_count
  FROM public.agency_subscriptions
  WHERE metadata->>'created_via' = 'backfill_migration';

  SELECT COUNT(*) INTO reset_count
  FROM public.agencies
  WHERE discovery_status = 'pending'
    AND created_at > NOW() - INTERVAL '30 days';

  RAISE NOTICE 'Backfilled % trial subscriptions', backfilled_count;
  RAISE NOTICE 'Reset % agencies to pending discovery status', reset_count;
END $$;
