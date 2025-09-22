-- Call Quality Filtering System
-- Automatically detect and filter out useless calls (voicemails, dead air, hold music, etc.)

-- Call quality metrics table for pre-analysis filtering
CREATE TABLE IF NOT EXISTS call_quality_metrics (
  call_id UUID PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,

  -- Audio metrics (populated during transcription)
  silence_ratio DECIMAL CHECK (silence_ratio >= 0 AND silence_ratio <= 1),
  avg_volume_db DECIMAL,
  peak_volume_db DECIMAL,
  noise_ratio DECIMAL CHECK (noise_ratio >= 0 AND noise_ratio <= 1),
  voice_activity_ratio DECIMAL CHECK (voice_activity_ratio >= 0 AND voice_activity_ratio <= 1),

  -- Speech metrics
  word_count INTEGER DEFAULT 0,
  words_per_minute DECIMAL,
  speaker_count INTEGER DEFAULT 0,
  longest_silence_ms INTEGER,
  agent_word_count INTEGER DEFAULT 0,
  customer_word_count INTEGER DEFAULT 0,
  speaker_turns INTEGER DEFAULT 0,

  -- Quality indicators
  has_music BOOLEAN DEFAULT false,
  has_dial_tone BOOLEAN DEFAULT false,
  has_beep_sound BOOLEAN DEFAULT false,
  has_hold_pattern BOOLEAN DEFAULT false,
  asr_confidence DECIMAL CHECK (asr_confidence >= 0 AND asr_confidence <= 1),

  -- Classification results
  quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
  classification VARCHAR(50) CHECK (classification IN (
    'analyzable',
    'voicemail',
    'dead_air',
    'hold_music',
    'wrong_number',
    'technical_failure',
    'automated_system',
    'no_agent',
    'insufficient_content',
    'ultra_short'
  )),
  is_analyzable BOOLEAN DEFAULT true,
  filter_reason TEXT,
  filter_confidence DECIMAL CHECK (filter_confidence >= 0 AND filter_confidence <= 1),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_word_counts CHECK (
    word_count >= 0 AND
    agent_word_count >= 0 AND
    customer_word_count >= 0 AND
    agent_word_count + customer_word_count <= word_count + 10 -- Allow small discrepancy
  )
);

-- Voicemail patterns library
CREATE TABLE IF NOT EXISTS voicemail_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL,
  pattern_type VARCHAR(20) CHECK (pattern_type IN ('keyword', 'phrase', 'regex')),
  confidence_boost DECIMAL DEFAULT 0.9,
  times_matched INTEGER DEFAULT 0,
  false_positive_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert common voicemail patterns
INSERT INTO voicemail_patterns (pattern, pattern_type, confidence_boost) VALUES
  ('leave a message', 'phrase', 0.95),
  ('leave your message', 'phrase', 0.95),
  ('after the beep', 'phrase', 0.98),
  ('after the tone', 'phrase', 0.98),
  ('voicemail', 'keyword', 0.9),
  ('voice mail', 'phrase', 0.9),
  ('not available', 'phrase', 0.85),
  ('currently unavailable', 'phrase', 0.9),
  ('reached the voice', 'phrase', 0.95),
  ('press pound', 'phrase', 0.85),
  ('mailbox', 'keyword', 0.88),
  ('unavailable to take your call', 'phrase', 0.92),
  ('leave a brief message', 'phrase', 0.95),
  ('record your message', 'phrase', 0.93),
  ('at the tone', 'phrase', 0.9)
ON CONFLICT DO NOTHING;

-- Wrong number patterns
CREATE TABLE IF NOT EXISTS wrong_number_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL,
  confidence_weight DECIMAL DEFAULT 0.9,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO wrong_number_patterns (pattern, confidence_weight) VALUES
  ('wrong number', 0.98),
  ('who is this', 0.85),
  ('didn''t call', 0.9),
  ('don''t know you', 0.88),
  ('mistake', 0.7),
  ('wrong person', 0.95),
  ('not expecting', 0.75),
  ('how did you get', 0.82)
ON CONFLICT DO NOTHING;

-- Automated system patterns
CREATE TABLE IF NOT EXISTS automated_system_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern TEXT NOT NULL,
  system_type VARCHAR(50),
  confidence_weight DECIMAL DEFAULT 0.9,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO automated_system_patterns (pattern, system_type, confidence_weight) VALUES
  ('press one', 'ivr', 0.95),
  ('press two', 'ivr', 0.95),
  ('press zero', 'ivr', 0.92),
  ('main menu', 'ivr', 0.9),
  ('for customer service', 'ivr', 0.88),
  ('para español', 'ivr', 0.95),
  ('your call is important', 'hold', 0.9),
  ('please stay on the line', 'hold', 0.92),
  ('all representatives are busy', 'hold', 0.95),
  ('next available', 'hold', 0.85)
ON CONFLICT DO NOTHING;

-- Filtered calls tracking for analysis
CREATE TABLE IF NOT EXISTS filtered_calls_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  classification VARCHAR(50) NOT NULL,
  filter_reason TEXT,
  confidence DECIMAL,
  duration_sec INTEGER,
  word_count INTEGER,
  processing_time_saved_ms INTEGER,
  cost_saved_cents INTEGER, -- Estimated API cost saved
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_filtered_calls_date (created_at DESC),
  INDEX idx_filtered_calls_classification (classification)
);

-- View for monitoring filter effectiveness
CREATE OR REPLACE VIEW filter_effectiveness_daily AS
SELECT
  DATE(cqm.created_at) as date,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE cqm.is_analyzable = true) as analyzed,
  COUNT(*) FILTER (WHERE cqm.is_analyzable = false) as filtered,
  COUNT(*) FILTER (WHERE cqm.classification = 'voicemail') as voicemails,
  COUNT(*) FILTER (WHERE cqm.classification = 'dead_air') as dead_air,
  COUNT(*) FILTER (WHERE cqm.classification = 'hold_music') as hold_music,
  COUNT(*) FILTER (WHERE cqm.classification = 'no_agent') as no_agent,
  COUNT(*) FILTER (WHERE cqm.classification = 'wrong_number') as wrong_numbers,
  COUNT(*) FILTER (WHERE cqm.classification = 'automated_system') as automated_systems,
  ROUND(
    COUNT(*) FILTER (WHERE cqm.is_analyzable = false)::DECIMAL /
    NULLIF(COUNT(*), 0) * 100, 1
  ) as filter_rate_pct,
  -- Calculate time saved (assuming 2 seconds per filtered call for API processing)
  COUNT(*) FILTER (WHERE cqm.is_analyzable = false) * 2 as seconds_saved,
  -- Calculate cost saved (assuming $0.01 per call for AI analysis)
  COUNT(*) FILTER (WHERE cqm.is_analyzable = false) * 1 as cents_saved
FROM call_quality_metrics cqm
GROUP BY DATE(cqm.created_at)
ORDER BY date DESC;

-- View for agent quality (excluding filtered calls)
CREATE OR REPLACE VIEW agent_quality_adjusted AS
SELECT
  COALESCE(c.agent_name, a.name) as agent_name,
  COUNT(DISTINCT c.id) as total_calls,
  COUNT(DISTINCT c.id) FILTER (WHERE cqm.is_analyzable = true) as analyzable_calls,
  COUNT(DISTINCT c.id) FILTER (WHERE cqm.classification = 'voicemail') as hit_voicemails,
  COUNT(DISTINCT c.id) FILTER (WHERE cqm.classification = 'wrong_number') as wrong_numbers,
  ROUND(
    COUNT(DISTINCT c.id) FILTER (WHERE cqm.is_analyzable = true)::DECIMAL /
    NULLIF(COUNT(DISTINCT c.id), 0) * 100, 1
  ) as quality_call_rate,
  AVG(cqm.quality_score) FILTER (WHERE cqm.is_analyzable = true) as avg_quality_score
FROM calls c
LEFT JOIN agents a ON c.agent_id = a.id
LEFT JOIN call_quality_metrics cqm ON cqm.call_id = c.id
WHERE c.created_at >= NOW() - INTERVAL '7 days'
  AND (c.agent_name IS NOT NULL OR a.name IS NOT NULL)
GROUP BY COALESCE(c.agent_name, a.name)
ORDER BY quality_call_rate DESC;

-- Function to classify call quality
CREATE OR REPLACE FUNCTION classify_call_quality(
  p_word_count INTEGER,
  p_agent_words INTEGER,
  p_silence_ratio DECIMAL,
  p_asr_confidence DECIMAL,
  p_transcript TEXT
) RETURNS TABLE (
  classification VARCHAR(50),
  is_analyzable BOOLEAN,
  filter_reason TEXT,
  confidence DECIMAL
) AS $$
DECLARE
  v_classification VARCHAR(50);
  v_is_analyzable BOOLEAN;
  v_filter_reason TEXT;
  v_confidence DECIMAL;
  v_lower_transcript TEXT;
BEGIN
  v_lower_transcript := LOWER(p_transcript);
  v_confidence := 1.0;

  -- Check for ultra short
  IF p_word_count < 5 THEN
    v_classification := 'ultra_short';
    v_is_analyzable := false;
    v_filter_reason := 'Less than 5 words detected';
    v_confidence := 1.0;

  -- Check for dead air
  ELSIF p_word_count < 20 OR p_silence_ratio > 0.85 THEN
    v_classification := 'dead_air';
    v_is_analyzable := false;
    v_filter_reason := FORMAT('Only %s words, %s%% silence', p_word_count, ROUND(p_silence_ratio * 100));
    v_confidence := 0.95;

  -- Check for no agent
  ELSIF p_agent_words < 10 THEN
    v_classification := 'no_agent';
    v_is_analyzable := false;
    v_filter_reason := FORMAT('Agent spoke only %s words', p_agent_words);
    v_confidence := 0.9;

  -- Check for voicemail
  ELSIF EXISTS (
    SELECT 1 FROM voicemail_patterns vp
    WHERE vp.is_active = true
    AND v_lower_transcript LIKE '%' || LOWER(vp.pattern) || '%'
  ) THEN
    v_classification := 'voicemail';
    v_is_analyzable := false;
    v_filter_reason := 'Voicemail keywords detected';
    v_confidence := (
      SELECT MAX(confidence_boost)
      FROM voicemail_patterns vp
      WHERE vp.is_active = true
      AND v_lower_transcript LIKE '%' || LOWER(vp.pattern) || '%'
    );

  -- Check for wrong number
  ELSIF EXISTS (
    SELECT 1 FROM wrong_number_patterns wnp
    WHERE wnp.is_active = true
    AND v_lower_transcript LIKE '%' || LOWER(wnp.pattern) || '%'
  ) THEN
    v_classification := 'wrong_number';
    v_is_analyzable := false;
    v_filter_reason := 'Wrong number pattern detected';
    v_confidence := 0.88;

  -- Check for automated system
  ELSIF EXISTS (
    SELECT 1 FROM automated_system_patterns asp
    WHERE asp.is_active = true
    AND v_lower_transcript LIKE '%' || LOWER(asp.pattern) || '%'
  ) THEN
    v_classification := 'automated_system';
    v_is_analyzable := false;
    v_filter_reason := 'Automated system detected';
    v_confidence := 0.85;

  -- Check ASR confidence
  ELSIF p_asr_confidence < 0.3 THEN
    v_classification := 'technical_failure';
    v_is_analyzable := false;
    v_filter_reason := FORMAT('ASR confidence too low: %s', ROUND(p_asr_confidence, 2));
    v_confidence := 0.9;

  -- Default: analyzable
  ELSE
    v_classification := 'analyzable';
    v_is_analyzable := true;
    v_filter_reason := NULL;
    v_confidence := 1.0;
  END IF;

  RETURN QUERY SELECT v_classification, v_is_analyzable, v_filter_reason, v_confidence;
END;
$$ LANGUAGE plpgsql;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_quality_metrics_call ON call_quality_metrics(call_id);
CREATE INDEX IF NOT EXISTS idx_call_quality_metrics_classification ON call_quality_metrics(classification);
CREATE INDEX IF NOT EXISTS idx_call_quality_metrics_analyzable ON call_quality_metrics(is_analyzable);
CREATE INDEX IF NOT EXISTS idx_call_quality_metrics_created ON call_quality_metrics(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_filtered_calls_log_call ON filtered_calls_log(call_id);
CREATE INDEX IF NOT EXISTS idx_filtered_calls_log_created ON filtered_calls_log(created_at DESC);

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_quality_metrics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_call_quality_metrics_timestamp
  BEFORE UPDATE ON call_quality_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_quality_metrics_timestamp();

-- Grant permissions
GRANT ALL ON call_quality_metrics TO authenticated;
GRANT ALL ON voicemail_patterns TO authenticated;
GRANT ALL ON wrong_number_patterns TO authenticated;
GRANT ALL ON automated_system_patterns TO authenticated;
GRANT ALL ON filtered_calls_log TO authenticated;
GRANT SELECT ON filter_effectiveness_daily TO authenticated;
GRANT SELECT ON agent_quality_adjusted TO authenticated;

-- Comments
COMMENT ON TABLE call_quality_metrics IS 'Pre-analysis quality assessment to filter out useless calls';
COMMENT ON TABLE voicemail_patterns IS 'Patterns for detecting voicemail/answering machines';
COMMENT ON TABLE filtered_calls_log IS 'Log of calls filtered out before AI analysis';
COMMENT ON VIEW filter_effectiveness_daily IS 'Daily statistics on filtering effectiveness and cost savings';