-- Fix Call System SQL
-- This migration adds missing components for proper call tracking

-- 1. Add phone_number column to calls table if it doesn't exist
ALTER TABLE public.calls
ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- 2. Create the missing add_call_event function
CREATE OR REPLACE FUNCTION public.add_call_event(
  p_event_type TEXT,
  p_event_data JSONB
)
RETURNS UUID AS $$
DECLARE
  new_event_id UUID;
BEGIN
  INSERT INTO public.call_events (
    event_type,
    payload,
    created_at
  ) VALUES (
    p_event_type,
    p_event_data,
    NOW()
  )
  RETURNING id INTO new_event_id;

  RETURN new_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.add_call_event TO authenticated;

-- 4. Create index on calls table for faster queries
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON public.calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON public.calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent_name ON public.calls(agent_name);

-- 5. Create a view to simplify call data retrieval with all related info
CREATE OR REPLACE VIEW public.call_details AS
SELECT
  c.*,
  a.name as agent_full_name,
  a.email as agent_email,
  ce.payload->>'phone_number' as event_phone_number,
  ce.payload->>'disposition' as event_disposition
FROM public.calls c
LEFT JOIN public.agents a ON c.agent_id = a.id
LEFT JOIN LATERAL (
  SELECT payload
  FROM public.call_events ce
  WHERE ce.payload->>'lead_id' = c.lead_id::text
  ORDER BY ce.created_at DESC
  LIMIT 1
) ce ON true
ORDER BY c.created_at DESC;

-- Grant read access to authenticated users
GRANT SELECT ON public.call_details TO authenticated;

-- 6. Update existing calls to populate phone_number from call_events if available
UPDATE public.calls c
SET phone_number = ce.payload->>'phone_number'
FROM public.call_events ce
WHERE ce.payload->>'lead_id' = c.lead_id::text
  AND c.phone_number IS NULL
  AND ce.payload->>'phone_number' IS NOT NULL;