import { db } from '@/server/db';
import { SSEManager, BatchProgressTracker } from '@/lib/sse';
import { runTestCase, TestCase, TestRunResult } from './test-runner';

export interface BulkTestOptions {
  parallel?: number;  // Number of tests to run in parallel (default: 5)
  stopOnFailure?: boolean;  // Stop if any test fails
  testFilter?: {
    categories?: string[];  // Only run tests in these categories
    difficulty?: number[];  // Only run tests with these difficulty levels
  };
}

export interface BulkTestResult {
  suite_run_id: string;
  total_tests: number;
  completed_tests: number;
  failed_tests: number;
  avg_wer: number;
  avg_execution_time_ms: number;
  status: 'completed' | 'failed' | 'cancelled';
  started_at: Date;
  completed_at: Date;
  test_results: TestRunResult[];
}

/**
 * Run an entire test suite with parallel execution
 */
export async function runTestSuite(
  suiteId: string,
  options: BulkTestOptions = {}
): Promise<BulkTestResult> {
  const { parallel = 5, stopOnFailure = false, testFilter } = options;
  const startTime = new Date();

  try {
    // 1. Create suite run record
    const suiteRun = await db.one(`
      INSERT INTO ai_suite_runs (
        suite_id,
        status,
        started_at,
        triggered_by,
        trigger_type
      ) VALUES ($1, 'running', NOW(), 'manual', 'api')
      RETURNING id
    `, [suiteId]);

    const suiteRunId = suiteRun.id;

    // 2. Get all test cases for this suite
    let query = `
      SELECT
        id,
        suite_id,
        audio_url,
        audio_duration_sec,
        expected_transcript,
        expected_analysis,
        expected_classification,
        test_category,
        metadata
      FROM ai_test_cases
      WHERE suite_id = $1
        AND is_active = true
    `;

    const params: any[] = [suiteId];

    // Apply filters if provided
    if (testFilter?.categories && testFilter.categories.length > 0) {
      query += ` AND test_category = ANY($${params.length + 1})`;
      params.push(testFilter.categories);
    }

    if (testFilter?.difficulty && testFilter.difficulty.length > 0) {
      query += ` AND difficulty_level = ANY($${params.length + 1})`;
      params.push(testFilter.difficulty);
    }

    query += ` ORDER BY difficulty_level ASC`; // Start with easier tests

    const testCases: TestCase[] = await db.manyOrNone(query, params);

    if (testCases.length === 0) {
      throw new Error('No active test cases found for this suite');
    }

    // 3. Initialize progress tracking
    const batchId = BatchProgressTracker.initBatch(suiteId, testCases.length);

    // Update suite run with total tests
    await db.none(`
      UPDATE ai_suite_runs
      SET total_tests = $1
      WHERE id = $2
    `, [testCases.length, suiteRunId]);

    // Send initial SSE event
    SSEManager.sendEvent(`suite-${suiteId}`, 'suite-started', {
      suite_run_id: suiteRunId,
      total_tests: testCases.length
    });

    // 4. Execute tests in parallel batches
    const results: TestRunResult[] = [];
    const errors: any[] = [];
    let cancelled = false;

    // Process tests in chunks for controlled parallelism
    for (let i = 0; i < testCases.length; i += parallel) {
      if (cancelled) break;

      const batch = testCases.slice(i, Math.min(i + parallel, testCases.length));

      // Run batch in parallel
      const batchPromises = batch.map(async (testCase) => {
        try {
          // Link test run to suite run
          await db.none(`
            UPDATE ai_test_runs
            SET suite_run_id = $1
            WHERE test_case_id = $2
              AND suite_run_id IS NULL
              AND created_at >= NOW() - INTERVAL '1 minute'
          `, [suiteRunId, testCase.id]);

          // Validate audio URL before running test
          if (testCase.audio_url) {
            try {
              const urlCheck = await fetch(testCase.audio_url, {
                method: 'HEAD',
                signal: AbortSignal.timeout(5000)
              });

              const contentType = urlCheck.headers.get('content-type') || '';
              if (!urlCheck.ok || (!contentType.includes('audio') && !contentType.includes('mp3'))) {
                throw new Error(`Invalid audio URL: returns ${contentType} instead of audio`);
              }
            } catch (urlError: any) {
              throw new Error(`Audio URL validation failed: ${urlError.message}`);
            }
          }

          const result = await runTestCase(testCase);

          // Update progress
          BatchProgressTracker.updateProgress(batchId, {
            completed: BatchProgressTracker.getProgress(batchId)!.completed + 1
          });

          // Update suite run progress
          await db.none(`
            UPDATE ai_suite_runs
            SET completed_tests = completed_tests + 1
            WHERE id = $1
          `, [suiteRunId]);

          // Send progress update
          const progress = BatchProgressTracker.getProgress(batchId)!;
          SSEManager.sendEvent(`suite-${suiteId}`, 'progress', {
            suite_run_id: suiteRunId,
            completed: progress.completed,
            total: progress.total,
            percentage: Math.round((progress.completed / progress.total) * 100)
          });

          return result;
        } catch (error: any) {
          console.error(`[Bulk Tester] Test failed:`, error);

          BatchProgressTracker.updateProgress(batchId, {
            failed: BatchProgressTracker.getProgress(batchId)!.failed + 1
          });

          await db.none(`
            UPDATE ai_suite_runs
            SET failed_tests = failed_tests + 1
            WHERE id = $1
          `, [suiteRunId]);

          errors.push({ testCase: testCase.id, error: error.message });

          if (stopOnFailure) {
            cancelled = true;
            throw new Error(`Test failed (stopOnFailure=true): ${error.message}`);
          }

          return {
            test_run_id: '',
            call_id: '',
            status: 'failed' as const,
            execution_time_ms: 0,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }

      // Small delay between batches to avoid overwhelming the system
      if (i + parallel < testCases.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 5. Calculate aggregate metrics
    const successfulRuns = results.filter(r => r.status === 'completed');

    const avgWer = successfulRuns.length > 0
      ? successfulRuns
          .filter(r => r.transcript_wer !== undefined)
          .reduce((sum, r) => sum + r.transcript_wer!, 0) / successfulRuns.length
      : 0;

    const avgExecutionTime = successfulRuns.length > 0
      ? successfulRuns.reduce((sum, r) => sum + r.execution_time_ms, 0) / successfulRuns.length
      : 0;

    // 6. Update suite run with final metrics
    const status = cancelled ? 'cancelled' : (errors.length === 0 ? 'completed' : 'failed');

    await db.none(`
      UPDATE ai_suite_runs
      SET
        status = $1,
        avg_transcript_wer = $2,
        total_execution_time_ms = $3,
        completed_at = NOW()
      WHERE id = $4
    `, [status, avgWer, Date.now() - startTime.getTime(), suiteRunId]);

    // 7. Update daily metrics
    await updateDailyMetrics(suiteId, results);

    // Send completion event
    SSEManager.sendEvent(`suite-${suiteId}`, 'suite-completed', {
      suite_run_id: suiteRunId,
      status,
      total_tests: testCases.length,
      completed_tests: successfulRuns.length,
      failed_tests: errors.length,
      avg_wer: avgWer,
      avg_execution_time_ms: avgExecutionTime
    });

    return {
      suite_run_id: suiteRunId,
      total_tests: testCases.length,
      completed_tests: successfulRuns.length,
      failed_tests: errors.length,
      avg_wer: avgWer,
      avg_execution_time_ms: avgExecutionTime,
      status: status as any,
      started_at: startTime,
      completed_at: new Date(),
      test_results: results
    };

  } catch (error: any) {
    console.error('[Bulk Tester] Suite execution failed:', error);

    // Send error event
    SSEManager.sendEvent(`suite-${suiteId}`, 'suite-error', {
      error: error.message
    });

    throw error;
  }
}

/**
 * Update daily accuracy metrics
 */
async function updateDailyMetrics(suiteId: string, results: TestRunResult[]): Promise<void> {
  try {
    // Get engine information from the test runs
    const engineMetrics = await db.manyOrNone(`
      SELECT
        tr.transcription_engine as engine,
        DATE(tr.created_at) as date,
        COUNT(*) as total_tests,
        COUNT(*) FILTER (WHERE tr.status = 'completed') as successful_tests,
        COUNT(*) FILTER (WHERE tr.status = 'failed') as failed_tests,
        AVG(tr.transcript_wer) as avg_wer,
        AVG(tr.transcript_cer) as avg_cer,
        AVG(tr.actual_transcript_confidence) as avg_confidence,
        AVG(tr.transcription_time_ms) as avg_processing_time_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tr.transcript_wer) as p95_wer,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY tr.transcript_wer) as p99_wer
      FROM ai_test_runs tr
      WHERE tr.suite_run_id IN (
        SELECT id FROM ai_suite_runs WHERE suite_id = $1
      )
      AND tr.created_at >= CURRENT_DATE
      GROUP BY tr.transcription_engine, DATE(tr.created_at)
    `, [suiteId]);

    // Upsert metrics for each engine
    for (const metric of engineMetrics) {
      await db.none(`
        INSERT INTO ai_accuracy_metrics (
          date,
          engine,
          total_tests,
          successful_tests,
          failed_tests,
          avg_wer,
          avg_cer,
          avg_confidence,
          avg_processing_time_ms,
          p95_wer,
          p99_wer
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (date, engine, model) DO UPDATE SET
          total_tests = ai_accuracy_metrics.total_tests + EXCLUDED.total_tests,
          successful_tests = ai_accuracy_metrics.successful_tests + EXCLUDED.successful_tests,
          failed_tests = ai_accuracy_metrics.failed_tests + EXCLUDED.failed_tests,
          avg_wer = (ai_accuracy_metrics.avg_wer * ai_accuracy_metrics.total_tests + EXCLUDED.avg_wer * EXCLUDED.total_tests)
                    / (ai_accuracy_metrics.total_tests + EXCLUDED.total_tests),
          avg_cer = (ai_accuracy_metrics.avg_cer * ai_accuracy_metrics.total_tests + EXCLUDED.avg_cer * EXCLUDED.total_tests)
                    / (ai_accuracy_metrics.total_tests + EXCLUDED.total_tests),
          avg_confidence = (ai_accuracy_metrics.avg_confidence * ai_accuracy_metrics.total_tests + EXCLUDED.avg_confidence * EXCLUDED.total_tests)
                           / (ai_accuracy_metrics.total_tests + EXCLUDED.total_tests),
          avg_processing_time_ms = (ai_accuracy_metrics.avg_processing_time_ms * ai_accuracy_metrics.total_tests + EXCLUDED.avg_processing_time_ms * EXCLUDED.total_tests)
                                   / (ai_accuracy_metrics.total_tests + EXCLUDED.total_tests),
          p95_wer = EXCLUDED.p95_wer,
          p99_wer = EXCLUDED.p99_wer
      `, [
        metric.date,
        metric.engine || 'unknown',
        metric.total_tests,
        metric.successful_tests,
        metric.failed_tests,
        metric.avg_wer,
        metric.avg_cer,
        metric.avg_confidence,
        metric.avg_processing_time_ms,
        metric.p95_wer,
        metric.p99_wer
      ]);
    }

  } catch (error: any) {
    console.error('[Bulk Tester] Failed to update daily metrics:', error);
  }
}

/**
 * Cancel a running test suite
 */
export async function cancelTestSuite(suiteRunId: string): Promise<void> {
  await db.none(`
    UPDATE ai_suite_runs
    SET
      status = 'cancelled',
      completed_at = NOW()
    WHERE id = $1
      AND status = 'running'
  `, [suiteRunId]);

  // Cancel any pending test runs
  await db.none(`
    UPDATE ai_test_runs
    SET
      status = 'cancelled',
      completed_at = NOW()
    WHERE suite_run_id = $1
      AND status IN ('pending', 'running')
  `, [suiteRunId]);
}

/**
 * Get suite run status
 */
export async function getSuiteRunStatus(suiteRunId: string): Promise<any> {
  return db.one(`
    SELECT
      sr.*,
      s.name as suite_name,
      s.test_type,
      (
        SELECT json_agg(
          json_build_object(
            'test_run_id', tr.id,
            'test_case_id', tr.test_case_id,
            'status', tr.status,
            'wer', tr.transcript_wer,
            'execution_time', tr.total_execution_time_ms
          )
          ORDER BY tr.created_at DESC
        )
        FROM ai_test_runs tr
        WHERE tr.suite_run_id = sr.id
      ) as test_runs
    FROM ai_suite_runs sr
    JOIN ai_test_suites s ON s.id = sr.suite_id
    WHERE sr.id = $1
  `, [suiteRunId]);
}

/**
 * Schedule a recurring test suite
 */
export async function scheduleTestSuite(
  suiteId: string,
  schedule: 'hourly' | 'daily' | 'weekly'
): Promise<void> {
  // This would integrate with your cron job system
  // For now, just mark the suite as scheduled
  await db.none(`
    UPDATE ai_test_suites
    SET metadata = metadata || jsonb_build_object('schedule', $2)
    WHERE id = $1
  `, [suiteId, schedule]);
}