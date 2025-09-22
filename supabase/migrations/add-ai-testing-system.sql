-- =====================================================
-- AI CALL TESTING & REFINEMENT SYSTEM
-- =====================================================
-- This migration adds comprehensive testing infrastructure
-- that leverages the existing Deepgram/AssemblyAI transcription
-- and OpenAI/Anthropic analysis pipelines

-- =====================================================
-- PART 0: PREPARE EXISTING TABLES
-- =====================================================

-- Add is_test column to calls table if it doesn't exist
ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- =====================================================
-- PART 1: CORE TESTING TABLES
-- =====================================================

-- Test suites for organizing test campaigns
CREATE TABLE IF NOT EXISTS ai_test_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  test_type VARCHAR(50) NOT NULL CHECK (test_type IN (
    'transcription',     -- Test only ASR accuracy
    'analysis',          -- Test only AI analysis
    'full_pipeline',     -- Test complete flow
    'rejection_handling', -- Test rejection detection
    'quality_filtering'  -- Test call filtering
  )),
  target_engine VARCHAR(50), -- 'deepgram', 'assemblyai', 'both'
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual test cases within suites
CREATE TABLE IF NOT EXISTS ai_test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id UUID REFERENCES ai_test_suites(id) ON DELETE CASCADE,
  name VARCHAR(255),
  audio_url TEXT NOT NULL, -- S3/Supabase storage URL
  audio_duration_sec INTEGER,
  expected_transcript TEXT,
  expected_transcript_confidence DECIMAL(3,2),
  expected_analysis JSONB,
  expected_classification VARCHAR(50), -- For quality filtering tests
  test_category VARCHAR(100) CHECK (test_category IN (
    'clear_speech',
    'heavy_accent',
    'background_noise',
    'multiple_speakers',
    'technical_terms',
    'emotional_speech',
    'phone_quality',
    'fast_speech',
    'slow_speech',
    'voicemail',
    'wrong_number',
    'dead_air',
    'rejection_immediate',
    'rejection_with_rebuttal'
  )),
  metadata JSONB DEFAULT '{}', -- accent_type, noise_level, emotion, etc.
  difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 5),
  is_active BOOLEAN DEFAULT true,
  source VARCHAR(50), -- 'manual', 'generated', 'production_call'
  source_call_id UUID REFERENCES calls(id), -- If derived from real call
  created_at TIMESTAMP DEFAULT NOW()
);

-- Test execution runs
CREATE TABLE IF NOT EXISTS ai_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id UUID REFERENCES ai_test_cases(id) ON DELETE CASCADE,
  suite_run_id UUID, -- Groups multiple test runs together
  call_id UUID REFERENCES calls(id), -- Links to synthetic call in existing system

  -- Transcription results
  actual_transcript TEXT,
  actual_transcript_confidence DECIMAL(3,2),
  transcription_engine VARCHAR(50), -- 'deepgram', 'assemblyai'
  transcription_model VARCHAR(100), -- Specific model version
  transcription_time_ms INTEGER,

  -- Analysis results (if applicable)
  actual_analysis JSONB,
  analysis_model VARCHAR(100), -- 'gpt-4o-mini', 'claude-3.5-sonnet'
  analysis_time_ms INTEGER,

  -- Accuracy metrics
  transcript_wer DECIMAL(5,4), -- Word Error Rate
  transcript_cer DECIMAL(5,4), -- Character Error Rate
  analysis_accuracy_score DECIMAL(3,2),

  -- Quality filtering results
  actual_classification VARCHAR(50),
  classification_correct BOOLEAN,

  -- Performance metrics
  total_execution_time_ms INTEGER,
  total_cost_cents INTEGER, -- API costs

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled'
  )),
  error_message TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Feedback and corrections
CREATE TABLE IF NOT EXISTS ai_test_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id UUID REFERENCES ai_test_runs(id) ON DELETE CASCADE,

  -- Quick rating
  rating INTEGER CHECK (rating IN (-1, 0, 1)), -- thumbs down/neutral/up

  -- Detailed feedback
  transcription_correct BOOLEAN,
  analysis_correct BOOLEAN,

  -- Error categorization
  error_category VARCHAR(100) CHECK (error_category IN (
    'missed_words',
    'wrong_words',
    'extra_words',
    'speaker_confusion',
    'accent_misunderstanding',
    'technical_term_error',
    'number_error',
    'name_error',
    'punctuation_error',
    'analysis_wrong_reason',
    'analysis_wrong_sentiment',
    'analysis_missed_issue',
    'classification_error',
    'other'
  )),
  error_severity VARCHAR(20) CHECK (error_severity IN (
    'minor', 'moderate', 'major', 'critical'
  )),

  -- Corrections
  corrected_transcript TEXT,
  corrected_analysis JSONB,

  -- Notes and context
  notes TEXT,
  screenshot_url TEXT, -- For UI issues

  -- Metadata
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- PART 2: METRICS & ANALYTICS TABLES
-- =====================================================

-- Daily accuracy metrics by engine
CREATE TABLE IF NOT EXISTS ai_accuracy_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  engine VARCHAR(50) NOT NULL, -- 'deepgram', 'assemblyai', 'openai', 'anthropic'
  model VARCHAR(100),

  -- Volume metrics
  total_tests INTEGER DEFAULT 0,
  successful_tests INTEGER DEFAULT 0,
  failed_tests INTEGER DEFAULT 0,

  -- Accuracy metrics
  avg_wer DECIMAL(5,4), -- Average Word Error Rate
  avg_cer DECIMAL(5,4), -- Average Character Error Rate
  avg_confidence DECIMAL(3,2),
  p95_wer DECIMAL(5,4), -- 95th percentile WER
  p99_wer DECIMAL(5,4), -- 99th percentile WER

  -- Performance metrics
  avg_processing_time_ms INTEGER,
  p95_processing_time_ms INTEGER,
  p99_processing_time_ms INTEGER,

  -- Cost metrics
  total_cost_cents INTEGER,
  cost_per_minute_cents DECIMAL(6,2),

  -- Error breakdown
  error_categories JSONB DEFAULT '{}',

  -- Category-specific accuracy
  accuracy_by_category JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(date, engine, model)
);

-- Test suite execution history
CREATE TABLE IF NOT EXISTS ai_suite_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id UUID REFERENCES ai_test_suites(id),

  -- Execution details
  total_tests INTEGER,
  completed_tests INTEGER DEFAULT 0,
  failed_tests INTEGER DEFAULT 0,

  -- Aggregate metrics
  avg_transcript_wer DECIMAL(5,4),
  avg_analysis_accuracy DECIMAL(3,2),

  -- Performance
  total_execution_time_ms INTEGER,
  total_cost_cents INTEGER,

  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Execution context
  triggered_by VARCHAR(255),
  trigger_type VARCHAR(50), -- 'manual', 'scheduled', 'api'

  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- PART 3: TEST DATA GENERATION TABLES
-- =====================================================

-- Audio templates for test generation
CREATE TABLE IF NOT EXISTS ai_test_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  template_type VARCHAR(50) CHECK (template_type IN (
    'greeting', 'rejection', 'objection', 'question', 'confirmation', 'closing'
  )),
  text_template TEXT NOT NULL, -- With placeholders like {agent_name}, {company}
  variations JSONB DEFAULT '[]', -- Array of variation texts
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Simulation profiles for generating test audio
CREATE TABLE IF NOT EXISTS ai_simulation_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  profile_type VARCHAR(50) CHECK (profile_type IN (
    'accent', 'emotion', 'background', 'quality'
  )),

  -- Audio characteristics
  accent_type VARCHAR(100),
  emotion_type VARCHAR(50),
  speech_rate DECIMAL(3,2), -- 0.5 = half speed, 2.0 = double speed
  background_noise_type VARCHAR(100),
  noise_level_db INTEGER,

  -- Technical parameters
  sample_rate INTEGER DEFAULT 16000,
  bitrate INTEGER DEFAULT 128,
  compression_type VARCHAR(50),

  -- Settings JSON for specific generators
  generator_settings JSONB DEFAULT '{}',

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- PART 4: IMPROVEMENT TRACKING
-- =====================================================

-- Training dataset built from corrections
CREATE TABLE IF NOT EXISTS ai_training_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id UUID REFERENCES ai_test_runs(id),

  -- Original data
  audio_url TEXT NOT NULL,
  original_transcript TEXT,
  original_analysis JSONB,

  -- Corrected data
  corrected_transcript TEXT NOT NULL,
  corrected_analysis JSONB,

  -- Context
  engine VARCHAR(50),
  model VARCHAR(100),
  error_type VARCHAR(100),

  -- Quality check
  verified_by VARCHAR(255),
  verification_status VARCHAR(50) DEFAULT 'pending',

  -- Usage tracking
  used_in_training BOOLEAN DEFAULT false,
  training_batch_id UUID,

  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP
);

-- Model improvement experiments
CREATE TABLE IF NOT EXISTS ai_model_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Experiment type
  experiment_type VARCHAR(50) CHECK (experiment_type IN (
    'parameter_tuning',     -- Adjust ASR parameters
    'model_comparison',     -- A/B test different models
    'prompt_optimization',  -- Optimize analysis prompts
    'threshold_adjustment'  -- Adjust filtering thresholds
  )),

  -- Configuration
  baseline_config JSONB NOT NULL,
  experimental_config JSONB NOT NULL,

  -- Results
  baseline_metrics JSONB,
  experimental_metrics JSONB,
  improvement_percentage DECIMAL(5,2),

  -- Statistical significance
  sample_size INTEGER,
  p_value DECIMAL(6,5),
  is_significant BOOLEAN,

  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Decision
  outcome VARCHAR(50) CHECK (outcome IN (
    'adopted', 'rejected', 'needs_more_data', 'pending'
  )),
  outcome_notes TEXT,

  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- PART 5: INDEXES FOR PERFORMANCE
-- =====================================================

-- Test runs indexes
CREATE INDEX idx_test_runs_suite_run ON ai_test_runs(suite_run_id);
CREATE INDEX idx_test_runs_status ON ai_test_runs(status);
CREATE INDEX idx_test_runs_created ON ai_test_runs(created_at DESC);
CREATE INDEX idx_test_runs_case_id ON ai_test_runs(test_case_id);

-- Feedback indexes
CREATE INDEX idx_feedback_run_id ON ai_test_feedback(test_run_id);
CREATE INDEX idx_feedback_category ON ai_test_feedback(error_category);
CREATE INDEX idx_feedback_created ON ai_test_feedback(created_at DESC);

-- Metrics indexes
CREATE INDEX idx_metrics_date_engine ON ai_accuracy_metrics(date DESC, engine);
CREATE INDEX idx_metrics_date ON ai_accuracy_metrics(date DESC);

-- Suite runs indexes
CREATE INDEX idx_suite_runs_suite_id ON ai_suite_runs(suite_id);
CREATE INDEX idx_suite_runs_status ON ai_suite_runs(status);

-- Training corrections indexes
CREATE INDEX idx_training_verified ON ai_training_corrections(verification_status);
CREATE INDEX idx_training_used ON ai_training_corrections(used_in_training);

-- =====================================================
-- PART 6: VIEWS FOR ANALYTICS
-- =====================================================

-- Real-time test performance view
CREATE OR REPLACE VIEW ai_test_performance_realtime AS
SELECT
  DATE(tr.created_at) as test_date,
  tr.transcription_engine as engine,
  tc.test_category,
  COUNT(*) as test_count,
  AVG(tr.transcript_wer) as avg_wer,
  AVG(tr.transcript_cer) as avg_cer,
  AVG(tr.actual_transcript_confidence) as avg_confidence,
  AVG(tr.transcription_time_ms) as avg_time_ms,
  COUNT(*) FILTER (WHERE tr.transcript_wer < 0.05) as excellent_count,
  COUNT(*) FILTER (WHERE tr.transcript_wer >= 0.05 AND tr.transcript_wer < 0.15) as good_count,
  COUNT(*) FILTER (WHERE tr.transcript_wer >= 0.15 AND tr.transcript_wer < 0.25) as fair_count,
  COUNT(*) FILTER (WHERE tr.transcript_wer >= 0.25) as poor_count
FROM ai_test_runs tr
JOIN ai_test_cases tc ON tc.id = tr.test_case_id
WHERE tr.status = 'completed'
  AND tr.created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(tr.created_at), tr.transcription_engine, tc.test_category;

-- Feedback summary view
CREATE OR REPLACE VIEW ai_feedback_summary AS
SELECT
  tc.test_category,
  tf.error_category,
  tf.error_severity,
  COUNT(*) as feedback_count,
  COUNT(*) FILTER (WHERE tf.rating = 1) as thumbs_up,
  COUNT(*) FILTER (WHERE tf.rating = -1) as thumbs_down,
  COUNT(tf.corrected_transcript) as corrections_provided,
  AVG(tr.transcript_wer) as avg_wer_for_category
FROM ai_test_feedback tf
JOIN ai_test_runs tr ON tr.id = tf.test_run_id
JOIN ai_test_cases tc ON tc.id = tr.test_case_id
WHERE tf.created_at >= NOW() - INTERVAL '30 days'
GROUP BY tc.test_category, tf.error_category, tf.error_severity;

-- Engine comparison view
CREATE OR REPLACE VIEW ai_engine_comparison AS
SELECT
  tc.test_category,
  tr.transcription_engine,
  COUNT(*) as tests_run,
  AVG(tr.transcript_wer) as avg_wer,
  AVG(tr.actual_transcript_confidence) as avg_confidence,
  AVG(tr.transcription_time_ms) as avg_time_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tr.transcript_wer) as median_wer,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tr.transcript_wer) as p95_wer
FROM ai_test_runs tr
JOIN ai_test_cases tc ON tc.id = tr.test_case_id
WHERE tr.status = 'completed'
  AND tr.created_at >= NOW() - INTERVAL '7 days'
GROUP BY tc.test_category, tr.transcription_engine;

-- =====================================================
-- PART 7: STORED FUNCTIONS
-- =====================================================

-- Calculate Word Error Rate (WER)
CREATE OR REPLACE FUNCTION calculate_wer(
  reference TEXT,
  hypothesis TEXT
) RETURNS DECIMAL AS $$
DECLARE
  ref_words TEXT[];
  hyp_words TEXT[];
  distance INTEGER;
  ref_length INTEGER;
BEGIN
  -- Simple word-level tokenization
  ref_words := string_to_array(lower(reference), ' ');
  hyp_words := string_to_array(lower(hypothesis), ' ');

  ref_length := array_length(ref_words, 1);

  IF ref_length = 0 THEN
    RETURN 0;
  END IF;

  -- This is a simplified WER calculation
  -- In production, use proper Levenshtein distance
  distance := ABS(ref_length - array_length(hyp_words, 1));

  RETURN LEAST(1.0, distance::DECIMAL / ref_length);
END;
$$ LANGUAGE plpgsql;

-- Trigger to calculate metrics on test completion
CREATE OR REPLACE FUNCTION calculate_test_metrics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.actual_transcript IS NOT NULL THEN
    -- Calculate WER if expected transcript exists
    IF EXISTS (
      SELECT 1 FROM ai_test_cases
      WHERE id = NEW.test_case_id
      AND expected_transcript IS NOT NULL
    ) THEN
      UPDATE ai_test_runs
      SET transcript_wer = calculate_wer(
        (SELECT expected_transcript FROM ai_test_cases WHERE id = NEW.test_case_id),
        NEW.actual_transcript
      )
      WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_test_metrics
AFTER UPDATE ON ai_test_runs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION calculate_test_metrics();

-- =====================================================
-- PART 8: SAMPLE DATA
-- =====================================================

-- Insert sample test templates (only if they don't exist)
INSERT INTO ai_test_templates (name, template_type, text_template, variations)
SELECT * FROM (VALUES
  ('Standard Greeting', 'greeting',
   'Hi {customer_name}, this is {agent_name} from {company}. How are you today?',
   '["Hi, this is {agent_name} calling from {company}.", "Hello {customer_name}, {agent_name} here from {company}."]'::JSONB),

  ('Immediate Rejection', 'rejection',
   'Not interested, take me off your list.',
   '["I''m not interested.", "Don''t call me again.", "Remove me from your list."]'::JSONB),

  ('Insurance Objection', 'objection',
   'I already have insurance through {provider}.',
   '["I''m covered through work.", "I have {provider} already.", "My spouse handles our insurance."]'::JSONB)
) AS v(name, template_type, text_template, variations)
WHERE NOT EXISTS (SELECT 1 FROM ai_test_templates WHERE ai_test_templates.name = v.name);

-- Insert simulation profiles (only if they don't exist)
INSERT INTO ai_simulation_profiles (name, profile_type, accent_type, speech_rate, background_noise_type, noise_level_db)
SELECT * FROM (VALUES
  ('Clear Speech', 'quality', 'neutral', 1.0, 'none', 0),
  ('Southern Accent', 'accent', 'southern_us', 1.0, 'none', 0),
  ('Fast Talker', 'quality', 'neutral', 1.5, 'none', 0),
  ('Noisy Office', 'background', 'neutral', 1.0, 'office', 15),
  ('Poor Phone', 'quality', 'neutral', 1.0, 'compression', 20)
) AS v(name, profile_type, accent_type, speech_rate, background_noise_type, noise_level_db)
WHERE NOT EXISTS (SELECT 1 FROM ai_simulation_profiles WHERE ai_simulation_profiles.name = v.name);

-- =====================================================
-- PART 9: ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on sensitive tables
ALTER TABLE ai_test_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_test_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_training_corrections ENABLE ROW LEVEL SECURITY;

-- Admin access policies
CREATE POLICY "Admins can manage test suites"
  ON ai_test_suites
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

CREATE POLICY "Users can submit feedback"
  ON ai_test_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own feedback"
  ON ai_test_feedback
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid()::TEXT);

-- =====================================================
-- PART 10: GRANTS
-- =====================================================

-- Grant permissions to the application role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Grant read access to authenticated users
GRANT SELECT ON ai_test_performance_realtime TO authenticated;
GRANT SELECT ON ai_feedback_summary TO authenticated;
GRANT SELECT ON ai_engine_comparison TO authenticated;

-- Comments for documentation
COMMENT ON TABLE ai_test_suites IS 'Organizes test cases into logical groups for batch execution';
COMMENT ON TABLE ai_test_cases IS 'Individual test cases with expected results';
COMMENT ON TABLE ai_test_runs IS 'Execution history and results for each test';
COMMENT ON TABLE ai_test_feedback IS 'Human feedback and corrections for test results';
COMMENT ON TABLE ai_accuracy_metrics IS 'Daily aggregated metrics for tracking accuracy trends';
COMMENT ON TABLE ai_training_corrections IS 'Verified corrections used for model improvement';
COMMENT ON TABLE ai_model_experiments IS 'A/B testing and experimentation tracking';

-- =====================================================
-- Migration complete!
-- This system will test your existing Deepgram/AssemblyAI
-- transcription and OpenAI/Anthropic analysis pipelines
-- =====================================================