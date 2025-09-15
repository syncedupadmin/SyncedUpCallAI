-- Add missing convoso_lead_id column to calls table
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS convoso_lead_id VARCHAR(255);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_calls_convoso_lead_id
ON public.calls(convoso_lead_id);

-- Also add lead_id if missing
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS lead_id VARCHAR(255);

-- Add index for lead_id
CREATE INDEX IF NOT EXISTS idx_calls_lead_id
ON public.calls(lead_id);

-- Check the table structure
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'calls'
  AND column_name IN ('lead_id', 'convoso_lead_id', 'agent_email', 'agent_name')
ORDER BY column_name;