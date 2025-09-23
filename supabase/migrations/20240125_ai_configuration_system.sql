-- AI Configuration Management System Schema
-- Purpose: Track and manage Deepgram transcription settings and their performance impact

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS ai_keyword_metrics CASCADE;
DROP TABLE IF EXISTS ai_config_tests CASCADE;
DROP TABLE IF EXISTS ai_configurations CASCADE;

-- Configuration versions with performance metrics
CREATE TABLE ai_configurations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT false,
  accuracy_score DECIMAL(5,2),
  word_error_rate DECIMAL(5,3),
  keywords_count INTEGER DEFAULT 0,
  replacements_count INTEGER DEFAULT 0,
  custom_vocabulary_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  activated_at TIMESTAMP WITH TIME ZONE,
  deactivated_at TIMESTAMP WITH TIME ZONE,
  performance_delta DECIMAL(5,2), -- +/- vs baseline
  parent_config_id UUID REFERENCES ai_configurations(id), -- For tracking versions
  is_factory_default BOOLEAN DEFAULT false,
  total_tests_run INTEGER DEFAULT 0,
  avg_processing_time INTEGER -- milliseconds
);

-- Create a unique partial index to ensure only one active configuration
CREATE UNIQUE INDEX idx_only_one_active ON ai_configurations (is_active) WHERE is_active = true;

-- Test results for each configuration
CREATE TABLE ai_config_tests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID REFERENCES ai_configurations(id) ON DELETE CASCADE,
  test_audio_url TEXT,
  test_audio_duration INTEGER, -- seconds
  expected_text TEXT,
  actual_text TEXT,
  accuracy DECIMAL(5,2),
  wer DECIMAL(5,3),
  processing_time INTEGER, -- milliseconds
  word_count INTEGER,
  differences JSONB, -- Detailed diff analysis
  problematic_words JSONB, -- Words that were incorrectly transcribed
  tested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tested_by UUID REFERENCES auth.users(id),
  test_type TEXT CHECK (test_type IN ('manual', 'automated', 'comparison')),
  passed BOOLEAN GENERATED ALWAYS AS (accuracy >= 70) STORED
);

-- Track individual keyword performance
CREATE TABLE ai_keyword_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  boost_value INTEGER,
  times_detected INTEGER DEFAULT 0,
  times_missed INTEGER DEFAULT 0,
  accuracy_impact DECIMAL(5,2), -- positive = helps, negative = hurts
  added_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  added_by UUID REFERENCES auth.users(id),
  last_tested TIMESTAMP WITH TIME ZONE,
  is_harmful BOOLEAN GENERATED ALWAYS AS (accuracy_impact < -2) STORED,
  is_beneficial BOOLEAN GENERATED ALWAYS AS (accuracy_impact > 2) STORED,
  config_ids UUID[] DEFAULT '{}', -- Which configs use this keyword
  recommendation TEXT, -- 'keep', 'remove', 'modify', 'test_more'
  notes TEXT,
  UNIQUE(keyword)
);

-- Indexes for performance
CREATE INDEX idx_ai_configs_active ON ai_configurations(is_active) WHERE is_active = true;
CREATE INDEX idx_ai_configs_created ON ai_configurations(created_at DESC);
CREATE INDEX idx_ai_configs_accuracy ON ai_configurations(accuracy_score DESC);
CREATE INDEX idx_ai_config_tests_config ON ai_config_tests(config_id);
CREATE INDEX idx_ai_config_tests_date ON ai_config_tests(tested_at DESC);
CREATE INDEX idx_ai_keyword_metrics_impact ON ai_keyword_metrics(accuracy_impact);
CREATE INDEX idx_ai_keyword_metrics_harmful ON ai_keyword_metrics(is_harmful) WHERE is_harmful = true;

-- Insert factory default configuration
INSERT INTO ai_configurations (
  name,
  description,
  config,
  is_active,
  accuracy_score,
  word_error_rate,
  is_factory_default,
  keywords_count,
  replacements_count
) VALUES (
  'Factory Defaults',
  'Original Deepgram nova-2-phonecall settings without customization',
  '{
    "model": "nova-2-phonecall",
    "language": "en-US",
    "punctuate": true,
    "diarize": true,
    "smart_format": true,
    "utterances": true,
    "numerals": true,
    "profanity_filter": false,
    "keywords": [],
    "replacements": [],
    "custom_vocabulary": [],
    "boost_values": {}
  }'::jsonb,
  false,
  90.0,
  0.10,
  true,
  0,
  0
);

-- Insert current over-tuned configuration (to be updated with actual values)
INSERT INTO ai_configurations (
  name,
  description,
  config,
  is_active,
  accuracy_score,
  word_error_rate,
  keywords_count,
  replacements_count,
  performance_delta
) VALUES (
  'Current Production (Over-tuned)',
  'Current configuration with excessive keywords causing accuracy issues',
  '{
    "model": "nova-2-phonecall",
    "language": "en-US",
    "punctuate": true,
    "diarize": true,
    "smart_format": true,
    "utterances": true,
    "numerals": true,
    "profanity_filter": false,
    "keywords": ["sale:2", "post date:2", "appointment:2", "schedule:2", "callback:2", "interested:2", "not interested:2", "remove:2", "do not call:2", "wrong number:2", "hello:1", "goodbye:1", "yes:1", "no:1", "maybe:1", "insurance:2", "coverage:2", "policy:2", "premium:2", "deductible:2", "quote:2", "price:2", "cost:2", "benefit:2", "medicare:2", "medicaid:2", "health:2", "life:2", "auto:2", "home:2", "business:2", "commercial:2", "personal:2", "family:2", "individual:2", "group:2", "employer:2", "employee:2", "spouse:2", "dependent:2", "child:2", "parent:2", "senior:2", "disability:2", "social security:2", "retirement:2", "pension:2"],
    "replacements": {
      "gonna": "going to",
      "wanna": "want to",
      "gotta": "got to",
      "kinda": "kind of",
      "sorta": "sort of",
      "shoulda": "should have",
      "woulda": "would have",
      "coulda": "could have",
      "ain''t": "is not",
      "won''t": "will not",
      "can''t": "cannot",
      "didn''t": "did not",
      "doesn''t": "does not",
      "isn''t": "is not",
      "wasn''t": "was not",
      "haven''t": "have not",
      "hasn''t": "has not",
      "wouldn''t": "would not",
      "couldn''t": "could not",
      "shouldn''t": "should not",
      "y''all": "you all",
      "lemme": "let me",
      "gimme": "give me"
    },
    "custom_vocabulary": []
  }'::jsonb,
  true,
  65.0,
  0.35,
  47,
  23,
  -25.0
);

-- Function to calculate keyword impact
CREATE OR REPLACE FUNCTION calculate_keyword_impact(
  keyword_text TEXT,
  boost_val INTEGER DEFAULT 1
) RETURNS DECIMAL AS $$
DECLARE
  baseline_accuracy DECIMAL;
  with_keyword_accuracy DECIMAL;
  impact DECIMAL;
BEGIN
  -- Get baseline accuracy (factory default)
  SELECT accuracy_score INTO baseline_accuracy
  FROM ai_configurations
  WHERE is_factory_default = true
  LIMIT 1;

  -- Get average accuracy of configs using this keyword
  SELECT AVG(c.accuracy_score) INTO with_keyword_accuracy
  FROM ai_configurations c
  WHERE c.config->'keywords' ? keyword_text;

  IF with_keyword_accuracy IS NULL THEN
    RETURN 0;
  END IF;

  impact := with_keyword_accuracy - baseline_accuracy;
  RETURN impact;
END;
$$ LANGUAGE plpgsql;

-- Function to recommend action for a keyword
CREATE OR REPLACE FUNCTION recommend_keyword_action(
  impact DECIMAL
) RETURNS TEXT AS $$
BEGIN
  IF impact < -5 THEN
    RETURN 'remove';
  ELSIF impact < -2 THEN
    RETURN 'modify';
  ELSIF impact > 2 THEN
    RETURN 'keep';
  ELSE
    RETURN 'test_more';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to backup configuration before changes
CREATE OR REPLACE FUNCTION backup_configuration()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    -- Configuration is being deactivated, record the timestamp
    NEW.deactivated_at = NOW();
  END IF;

  IF OLD.is_active = false AND NEW.is_active = true THEN
    -- Configuration is being activated
    NEW.activated_at = NOW();

    -- Deactivate any other active configuration
    UPDATE ai_configurations
    SET is_active = false,
        deactivated_at = NOW()
    WHERE is_active = true
      AND id != NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER backup_config_trigger
  BEFORE UPDATE ON ai_configurations
  FOR EACH ROW
  EXECUTE FUNCTION backup_configuration();

-- Function to analyze configuration for over-tuning
CREATE OR REPLACE FUNCTION analyze_overtuning(config_id UUID)
RETURNS JSONB AS $$
DECLARE
  config_data JSONB;
  keyword_count INTEGER;
  replacement_count INTEGER;
  baseline_accuracy DECIMAL;
  current_accuracy DECIMAL;
  result JSONB;
BEGIN
  -- Get configuration data
  SELECT config, keywords_count, replacements_count, accuracy_score
  INTO config_data, keyword_count, replacement_count, current_accuracy
  FROM ai_configurations
  WHERE id = config_id;

  -- Get baseline accuracy
  SELECT accuracy_score INTO baseline_accuracy
  FROM ai_configurations
  WHERE is_factory_default = true
  LIMIT 1;

  -- Build analysis result
  result := jsonb_build_object(
    'is_overtuned', keyword_count > 10,
    'severity', CASE
      WHEN keyword_count > 40 THEN 'critical'
      WHEN keyword_count > 20 THEN 'high'
      WHEN keyword_count > 10 THEN 'medium'
      ELSE 'low'
    END,
    'keyword_count', keyword_count,
    'replacement_count', replacement_count,
    'recommended_keyword_limit', 10,
    'keywords_over_limit', GREATEST(0, keyword_count - 10),
    'accuracy_impact', current_accuracy - baseline_accuracy,
    'recommendation', CASE
      WHEN keyword_count > 40 THEN 'Immediately remove problematic keywords and reset to defaults'
      WHEN keyword_count > 20 THEN 'Remove low-impact keywords and test thoroughly'
      WHEN keyword_count > 10 THEN 'Review and optimize keyword list'
      ELSE 'Configuration is within recommended limits'
    END
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- View for problematic keywords
CREATE OR REPLACE VIEW v_problematic_keywords AS
SELECT
  k.keyword,
  k.boost_value,
  k.accuracy_impact,
  k.times_detected,
  k.times_missed,
  k.recommendation,
  COUNT(DISTINCT ct.id) as test_count,
  AVG(ct.accuracy) as avg_test_accuracy
FROM ai_keyword_metrics k
LEFT JOIN ai_config_tests ct ON ct.config_id = ANY(k.config_ids)
WHERE k.is_harmful = true
GROUP BY k.id, k.keyword, k.boost_value, k.accuracy_impact,
         k.times_detected, k.times_missed, k.recommendation
ORDER BY k.accuracy_impact ASC;

-- View for configuration comparison
CREATE OR REPLACE VIEW v_config_comparison AS
SELECT
  c.id,
  c.name,
  c.is_active,
  c.is_factory_default,
  c.keywords_count,
  c.replacements_count,
  c.accuracy_score,
  c.word_error_rate,
  c.performance_delta,
  c.total_tests_run,
  c.created_at,
  (
    SELECT COUNT(*)
    FROM ai_config_tests
    WHERE config_id = c.id
      AND tested_at > NOW() - INTERVAL '7 days'
  ) as recent_tests,
  (
    SELECT AVG(accuracy)
    FROM ai_config_tests
    WHERE config_id = c.id
  ) as avg_test_accuracy
FROM ai_configurations c
ORDER BY c.created_at DESC;

-- Grant permissions (adjust based on your needs)
GRANT ALL ON ai_configurations TO authenticated;
GRANT ALL ON ai_config_tests TO authenticated;
GRANT ALL ON ai_keyword_metrics TO authenticated;
GRANT SELECT ON v_problematic_keywords TO authenticated;
GRANT SELECT ON v_config_comparison TO authenticated;