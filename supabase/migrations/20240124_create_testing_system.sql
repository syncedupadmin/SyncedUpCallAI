-- Create testing system tables
-- Drop existing tables if they exist
DROP TABLE IF EXISTS test_results CASCADE;
DROP TABLE IF EXISTS test_cases CASCADE;
DROP TABLE IF EXISTS test_suites CASCADE;
DROP TABLE IF EXISTS test_metrics CASCADE;

-- Test Suites table
CREATE TABLE test_suites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    status VARCHAR(50) DEFAULT 'active',
    config JSONB DEFAULT '{}',
    metrics JSONB DEFAULT '{}'
);

-- Test Cases table (individual test items with ground truth)
CREATE TABLE test_cases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    suite_id UUID REFERENCES test_suites(id) ON DELETE CASCADE,
    call_id UUID REFERENCES calls(id),
    name VARCHAR(255) NOT NULL,
    audio_url TEXT NOT NULL,
    ground_truth TEXT NOT NULL,
    duration_seconds INTEGER,
    metadata JSONB DEFAULT '{}',
    qa_score DECIMAL(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Test Results table (results from running tests)
CREATE TABLE test_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    test_case_id UUID REFERENCES test_cases(id) ON DELETE CASCADE,
    suite_id UUID REFERENCES test_suites(id) ON DELETE CASCADE,
    run_id UUID DEFAULT gen_random_uuid(),
    transcription TEXT,
    ground_truth TEXT,
    wer_score DECIMAL(5,2),
    accuracy DECIMAL(5,2),
    processing_time_ms INTEGER,
    deepgram_request_id VARCHAR(255),
    model_used VARCHAR(100),
    status VARCHAR(50),
    errors JSONB,
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Test Metrics table (aggregated metrics)
CREATE TABLE test_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    suite_id UUID REFERENCES test_suites(id) ON DELETE CASCADE,
    total_tests INTEGER DEFAULT 0,
    tests_passed INTEGER DEFAULT 0,
    tests_failed INTEGER DEFAULT 0,
    average_wer DECIMAL(5,2),
    average_accuracy DECIMAL(5,2),
    average_processing_time_ms INTEGER,
    success_rate DECIMAL(5,2),
    last_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_test_cases_suite_id ON test_cases(suite_id);
CREATE INDEX idx_test_results_test_case_id ON test_results(test_case_id);
CREATE INDEX idx_test_results_suite_id ON test_results(suite_id);
CREATE INDEX idx_test_results_run_id ON test_results(run_id);
CREATE INDEX idx_test_results_created_at ON test_results(created_at DESC);
CREATE INDEX idx_test_metrics_suite_id ON test_metrics(suite_id);

-- Create a function to calculate WER (Word Error Rate)
CREATE OR REPLACE FUNCTION calculate_wer(reference TEXT, hypothesis TEXT)
RETURNS DECIMAL AS $$
DECLARE
    ref_words TEXT[];
    hyp_words TEXT[];
    ref_len INTEGER;
    hyp_len INTEGER;
    distance INTEGER;
BEGIN
    -- Normalize and split into words
    ref_words := string_to_array(LOWER(REGEXP_REPLACE(reference, '[^a-zA-Z0-9\s]', '', 'g')), ' ');
    hyp_words := string_to_array(LOWER(REGEXP_REPLACE(hypothesis, '[^a-zA-Z0-9\s]', '', 'g')), ' ');

    ref_len := array_length(ref_words, 1);
    hyp_len := array_length(hyp_words, 1);

    -- Handle empty cases
    IF ref_len IS NULL OR ref_len = 0 THEN
        RETURN 0;
    END IF;

    IF hyp_len IS NULL OR hyp_len = 0 THEN
        RETURN 100;
    END IF;

    -- Simple approximation (should use proper Levenshtein distance for production)
    -- For now, use a simplified calculation
    distance := ABS(ref_len - hyp_len);

    RETURN LEAST(100, (distance::DECIMAL / ref_len) * 100);
END;
$$ LANGUAGE plpgsql;

-- Create a function to update test metrics
CREATE OR REPLACE FUNCTION update_test_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update metrics for the suite
    UPDATE test_metrics
    SET
        total_tests = (
            SELECT COUNT(*) FROM test_results WHERE suite_id = NEW.suite_id
        ),
        tests_passed = (
            SELECT COUNT(*) FROM test_results
            WHERE suite_id = NEW.suite_id AND wer_score < 15
        ),
        tests_failed = (
            SELECT COUNT(*) FROM test_results
            WHERE suite_id = NEW.suite_id AND wer_score >= 15
        ),
        average_wer = (
            SELECT AVG(wer_score) FROM test_results WHERE suite_id = NEW.suite_id
        ),
        average_accuracy = (
            SELECT AVG(accuracy) FROM test_results WHERE suite_id = NEW.suite_id
        ),
        average_processing_time_ms = (
            SELECT AVG(processing_time_ms) FROM test_results WHERE suite_id = NEW.suite_id
        ),
        success_rate = (
            SELECT
                CASE
                    WHEN COUNT(*) = 0 THEN 0
                    ELSE (COUNT(*) FILTER (WHERE wer_score < 15)::DECIMAL / COUNT(*)) * 100
                END
            FROM test_results WHERE suite_id = NEW.suite_id
        ),
        last_run_at = NOW(),
        updated_at = NOW()
    WHERE suite_id = NEW.suite_id;

    -- Create metrics entry if doesn't exist
    IF NOT FOUND THEN
        INSERT INTO test_metrics (suite_id, total_tests, tests_passed, tests_failed, average_wer, success_rate, last_run_at)
        VALUES (NEW.suite_id, 1,
                CASE WHEN NEW.wer_score < 15 THEN 1 ELSE 0 END,
                CASE WHEN NEW.wer_score >= 15 THEN 1 ELSE 0 END,
                NEW.wer_score,
                CASE WHEN NEW.wer_score < 15 THEN 100 ELSE 0 END,
                NOW());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update metrics
CREATE TRIGGER update_metrics_on_test_result
    AFTER INSERT OR UPDATE ON test_results
    FOR EACH ROW
    EXECUTE FUNCTION update_test_metrics();

-- Insert default test suite
INSERT INTO test_suites (name, description, status)
VALUES (
    'Default Test Suite',
    'Automated test suite for transcription accuracy testing',
    'active'
);

-- Grant permissions
GRANT ALL ON test_suites TO authenticated;
GRANT ALL ON test_cases TO authenticated;
GRANT ALL ON test_results TO authenticated;
GRANT ALL ON test_metrics TO authenticated;