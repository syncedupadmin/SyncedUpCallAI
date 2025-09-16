-- Backfill phone numbers from metadata JSON for calls that don't have them
-- This extracts phone data from the raw webhook payload stored in metadata

UPDATE calls
SET phone_number = COALESCE(
  -- Try various fields from the metadata JSON
  metadata->>'phone_number',
  metadata->>'customer_phone',
  metadata->>'phone',
  metadata->>'PhoneNumber',
  metadata->>'lead_phone',
  metadata->>'customer_number',
  metadata->>'contact_phone',
  metadata->>'to_number',
  metadata->>'from_number',
  metadata->'lead'->>'phone',
  metadata->'lead'->>'phone_number',
  metadata->'contact'->>'phone',
  metadata->'customer'->>'phone'
)
WHERE phone_number IS NULL
  AND metadata IS NOT NULL
  AND (
    metadata->>'phone_number' IS NOT NULL OR
    metadata->>'customer_phone' IS NOT NULL OR
    metadata->>'phone' IS NOT NULL OR
    metadata->>'PhoneNumber' IS NOT NULL OR
    metadata->>'lead_phone' IS NOT NULL OR
    metadata->>'customer_number' IS NOT NULL OR
    metadata->>'contact_phone' IS NOT NULL OR
    metadata->>'to_number' IS NOT NULL OR
    metadata->>'from_number' IS NOT NULL OR
    metadata->'lead'->>'phone' IS NOT NULL OR
    metadata->'lead'->>'phone_number' IS NOT NULL OR
    metadata->'contact'->>'phone' IS NOT NULL OR
    metadata->'customer'->>'phone' IS NOT NULL
  );

-- Check how many records would be updated
SELECT COUNT(*) as calls_to_update
FROM calls
WHERE phone_number IS NULL
  AND metadata IS NOT NULL;

-- Show sample of phone numbers that can be extracted
SELECT
  id,
  created_at,
  agent_name,
  COALESCE(
    metadata->>'phone_number',
    metadata->>'customer_phone',
    metadata->>'phone',
    metadata->>'PhoneNumber',
    metadata->>'lead_phone',
    metadata->>'customer_number',
    metadata->>'contact_phone',
    metadata->>'to_number',
    metadata->>'from_number',
    metadata->'lead'->>'phone',
    metadata->'lead'->>'phone_number',
    metadata->'contact'->>'phone',
    metadata->'customer'->>'phone'
  ) as extracted_phone
FROM calls
WHERE phone_number IS NULL
  AND metadata IS NOT NULL
LIMIT 10;