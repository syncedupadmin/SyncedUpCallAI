-- Daily revenue rollups table
CREATE TABLE IF NOT EXISTS revenue_rollups (
  id SERIAL PRIMARY KEY,
  date date NOT NULL,
  
  -- Call metrics
  total_calls int DEFAULT 0,
  total_duration_sec int DEFAULT 0,
  avg_duration_sec numeric(10,2) DEFAULT 0,
  
  -- Agent performance
  unique_agents int DEFAULT 0,
  top_agent_name text,
  top_agent_calls int DEFAULT 0,
  
  -- Customer metrics
  unique_customers int DEFAULT 0,
  new_customers int DEFAULT 0,
  returning_customers int DEFAULT 0,
  
  -- Policy metrics (from policies_stub)
  total_policies int DEFAULT 0,
  active_policies int DEFAULT 0,
  cancelled_policies int DEFAULT 0,
  
  -- Revenue metrics
  total_premium numeric(12,2) DEFAULT 0,
  active_premium numeric(12,2) DEFAULT 0,
  lost_premium numeric(12,2) DEFAULT 0, -- From cancellations
  at_risk_premium numeric(12,2) DEFAULT 0, -- High-risk calls
  
  -- Quality metrics
  avg_qa_score numeric(5,2) DEFAULT 0,
  low_qa_calls int DEFAULT 0, -- QA < 55
  high_qa_calls int DEFAULT 0, -- QA >= 85
  
  -- Risk metrics
  high_risk_calls int DEFAULT 0,
  escalations int DEFAULT 0,
  refund_requests int DEFAULT 0,
  cancellation_requests int DEFAULT 0,
  
  -- Disposition breakdown
  disposition_answered int DEFAULT 0,
  disposition_voicemail int DEFAULT 0,
  disposition_cancelled int DEFAULT 0,
  disposition_other int DEFAULT 0,
  
  -- Processing metadata
  processed_at timestamp DEFAULT now(),
  processing_time_ms int,
  
  UNIQUE(date)
);

-- Index for fast date lookups
CREATE INDEX IF NOT EXISTS idx_revenue_rollups_date ON revenue_rollups(date DESC);

-- Function to generate daily rollup
CREATE OR REPLACE FUNCTION generate_daily_rollup(target_date date)
RETURNS void AS $$
DECLARE
  start_ts timestamp;
  end_ts timestamp;
  rollup_record revenue_rollups%ROWTYPE;
BEGIN
  -- Set date boundaries
  start_ts := target_date::timestamp;
  end_ts := (target_date + interval '1 day')::timestamp;
  
  -- Initialize record
  rollup_record.date := target_date;
  
  -- Call metrics
  SELECT 
    COUNT(*),
    COALESCE(SUM(duration_sec), 0),
    COALESCE(AVG(duration_sec), 0)
  INTO 
    rollup_record.total_calls,
    rollup_record.total_duration_sec,
    rollup_record.avg_duration_sec
  FROM calls
  WHERE started_at >= start_ts AND started_at < end_ts;
  
  -- Agent metrics
  SELECT 
    COUNT(DISTINCT agent_name),
    agent_name,
    COUNT(*)
  INTO 
    rollup_record.unique_agents,
    rollup_record.top_agent_name,
    rollup_record.top_agent_calls
  FROM calls
  WHERE started_at >= start_ts AND started_at < end_ts
  GROUP BY agent_name
  ORDER BY COUNT(*) DESC
  LIMIT 1;
  
  -- Customer metrics
  SELECT COUNT(DISTINCT customer_phone)
  INTO rollup_record.unique_customers
  FROM calls
  WHERE started_at >= start_ts AND started_at < end_ts;
  
  -- Policy metrics
  SELECT 
    COUNT(*),
    COUNT(CASE WHEN status = 'active' THEN 1 END),
    COUNT(CASE WHEN status = 'cancelled' THEN 1 END),
    COALESCE(SUM(premium), 0),
    COALESCE(SUM(CASE WHEN status = 'active' THEN premium ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'cancelled' AND date_trunc('day', cancelled_date) = target_date THEN premium ELSE 0 END), 0)
  INTO 
    rollup_record.total_policies,
    rollup_record.active_policies,
    rollup_record.cancelled_policies,
    rollup_record.total_premium,
    rollup_record.active_premium,
    rollup_record.lost_premium
  FROM policies_stub;
  
  -- At-risk premium (high-risk calls with active policies)
  SELECT COALESCE(SUM(p.premium), 0)
  INTO rollup_record.at_risk_premium
  FROM calls c
  JOIN analyses a ON a.call_id = c.id
  JOIN policies_stub p ON p.phone = c.customer_phone AND p.status = 'active'
  WHERE c.started_at >= start_ts AND c.started_at < end_ts
    AND (a.qa_score < 55 OR a.reason_primary IN ('customer_escalation', 'refund_request', 'cancellation_request'));
  
  -- Quality metrics
  SELECT 
    COALESCE(AVG(qa_score), 0),
    COUNT(CASE WHEN qa_score < 55 THEN 1 END),
    COUNT(CASE WHEN qa_score >= 85 THEN 1 END)
  INTO 
    rollup_record.avg_qa_score,
    rollup_record.low_qa_calls,
    rollup_record.high_qa_calls
  FROM calls c
  JOIN analyses a ON a.call_id = c.id
  WHERE c.started_at >= start_ts AND c.started_at < end_ts;
  
  -- Risk metrics
  SELECT 
    COUNT(CASE WHEN qa_score < 55 OR reason_primary IN ('customer_escalation', 'refund_request', 'cancellation_request') THEN 1 END),
    COUNT(CASE WHEN reason_primary = 'customer_escalation' THEN 1 END),
    COUNT(CASE WHEN reason_primary = 'refund_request' THEN 1 END),
    COUNT(CASE WHEN reason_primary = 'cancellation_request' THEN 1 END)
  INTO 
    rollup_record.high_risk_calls,
    rollup_record.escalations,
    rollup_record.refund_requests,
    rollup_record.cancellation_requests
  FROM calls c
  LEFT JOIN analyses a ON a.call_id = c.id
  WHERE c.started_at >= start_ts AND c.started_at < end_ts;
  
  -- Disposition breakdown
  SELECT 
    COUNT(CASE WHEN disposition = 'Answered' THEN 1 END),
    COUNT(CASE WHEN disposition = 'Voicemail' THEN 1 END),
    COUNT(CASE WHEN disposition = 'Cancelled' THEN 1 END),
    COUNT(CASE WHEN disposition NOT IN ('Answered', 'Voicemail', 'Cancelled') THEN 1 END)
  INTO 
    rollup_record.disposition_answered,
    rollup_record.disposition_voicemail,
    rollup_record.disposition_cancelled,
    rollup_record.disposition_other
  FROM calls
  WHERE started_at >= start_ts AND started_at < end_ts;
  
  -- Upsert the rollup
  INSERT INTO revenue_rollups (
    date, total_calls, total_duration_sec, avg_duration_sec,
    unique_agents, top_agent_name, top_agent_calls,
    unique_customers, new_customers, returning_customers,
    total_policies, active_policies, cancelled_policies,
    total_premium, active_premium, lost_premium, at_risk_premium,
    avg_qa_score, low_qa_calls, high_qa_calls,
    high_risk_calls, escalations, refund_requests, cancellation_requests,
    disposition_answered, disposition_voicemail, disposition_cancelled, disposition_other
  ) VALUES (
    rollup_record.date, rollup_record.total_calls, rollup_record.total_duration_sec, rollup_record.avg_duration_sec,
    rollup_record.unique_agents, rollup_record.top_agent_name, rollup_record.top_agent_calls,
    rollup_record.unique_customers, rollup_record.new_customers, rollup_record.returning_customers,
    rollup_record.total_policies, rollup_record.active_policies, rollup_record.cancelled_policies,
    rollup_record.total_premium, rollup_record.active_premium, rollup_record.lost_premium, rollup_record.at_risk_premium,
    rollup_record.avg_qa_score, rollup_record.low_qa_calls, rollup_record.high_qa_calls,
    rollup_record.high_risk_calls, rollup_record.escalations, rollup_record.refund_requests, rollup_record.cancellation_requests,
    rollup_record.disposition_answered, rollup_record.disposition_voicemail, rollup_record.disposition_cancelled, rollup_record.disposition_other
  )
  ON CONFLICT (date) DO UPDATE SET
    total_calls = EXCLUDED.total_calls,
    total_duration_sec = EXCLUDED.total_duration_sec,
    avg_duration_sec = EXCLUDED.avg_duration_sec,
    unique_agents = EXCLUDED.unique_agents,
    top_agent_name = EXCLUDED.top_agent_name,
    top_agent_calls = EXCLUDED.top_agent_calls,
    unique_customers = EXCLUDED.unique_customers,
    new_customers = EXCLUDED.new_customers,
    returning_customers = EXCLUDED.returning_customers,
    total_policies = EXCLUDED.total_policies,
    active_policies = EXCLUDED.active_policies,
    cancelled_policies = EXCLUDED.cancelled_policies,
    total_premium = EXCLUDED.total_premium,
    active_premium = EXCLUDED.active_premium,
    lost_premium = EXCLUDED.lost_premium,
    at_risk_premium = EXCLUDED.at_risk_premium,
    avg_qa_score = EXCLUDED.avg_qa_score,
    low_qa_calls = EXCLUDED.low_qa_calls,
    high_qa_calls = EXCLUDED.high_qa_calls,
    high_risk_calls = EXCLUDED.high_risk_calls,
    escalations = EXCLUDED.escalations,
    refund_requests = EXCLUDED.refund_requests,
    cancellation_requests = EXCLUDED.cancellation_requests,
    disposition_answered = EXCLUDED.disposition_answered,
    disposition_voicemail = EXCLUDED.disposition_voicemail,
    disposition_cancelled = EXCLUDED.disposition_cancelled,
    disposition_other = EXCLUDED.disposition_other,
    processed_at = now();
    
END;
$$ LANGUAGE plpgsql;

-- Generate rollups for the last 30 days
DO $$
DECLARE
  d date;
BEGIN
  FOR d IN SELECT generate_series(
    CURRENT_DATE - interval '30 days',
    CURRENT_DATE,
    '1 day'::interval
  )::date
  LOOP
    PERFORM generate_daily_rollup(d);
  END LOOP;
END $$;