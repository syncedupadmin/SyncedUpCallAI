import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

// POST /api/testing/feedback - Submit feedback for a test run
export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const {
      test_run_id,
      rating,
      transcription_correct,
      analysis_correct,
      error_category,
      error_severity,
      corrected_transcript,
      corrected_analysis,
      notes
    } = await req.json();

    // Validate required fields
    if (!test_run_id) {
      return NextResponse.json(
        { error: 'test_run_id is required' },
        { status: 400 }
      );
    }

    // Check if test run exists
    const testRun = await db.oneOrNone(`
      SELECT id FROM ai_test_runs WHERE id = $1
    `, [test_run_id]);

    if (!testRun) {
      return NextResponse.json(
        { error: 'Test run not found' },
        { status: 404 }
      );
    }

    // Create feedback record
    const feedback = await db.one(`
      INSERT INTO ai_test_feedback (
        test_run_id,
        rating,
        transcription_correct,
        analysis_correct,
        error_category,
        error_severity,
        corrected_transcript,
        corrected_analysis,
        notes,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      test_run_id,
      rating || 0,
      transcription_correct !== undefined ? transcription_correct : null,
      analysis_correct !== undefined ? analysis_correct : null,
      error_category || null,
      error_severity || null,
      corrected_transcript || null,
      corrected_analysis ? JSON.stringify(corrected_analysis) : null,
      notes || null,
      'admin' // You could get this from auth context
    ]);

    // If correction provided, create training data
    if (corrected_transcript) {
      const testData = await db.one(`
        SELECT
          tr.id,
          tr.actual_transcript,
          tr.actual_analysis,
          tr.transcription_engine as engine,
          tc.audio_url
        FROM ai_test_runs tr
        JOIN ai_test_cases tc ON tc.id = tr.test_case_id
        WHERE tr.id = $1
      `, [test_run_id]);

      await db.none(`
        INSERT INTO ai_training_corrections (
          test_run_id,
          audio_url,
          original_transcript,
          original_analysis,
          corrected_transcript,
          corrected_analysis,
          engine,
          error_type,
          verified_by,
          verification_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'verified')
      `, [
        test_run_id,
        testData.audio_url,
        testData.actual_transcript,
        testData.actual_analysis,
        corrected_transcript,
        corrected_analysis ? JSON.stringify(corrected_analysis) : testData.actual_analysis,
        testData.engine,
        error_category,
        'admin'
      ]);

      // Check if we should trigger retraining
      const correctionCount = await db.one(`
        SELECT COUNT(*) as count
        FROM ai_training_corrections
        WHERE verification_status = 'verified'
          AND used_in_training = false
      `);

      if (correctionCount.count >= 100) {
        // Would trigger retraining process here
        console.log(`[Feedback] ${correctionCount.count} corrections available for training`);
      }
    }

    return NextResponse.json({
      success: true,
      feedback_id: feedback.id,
      message: 'Feedback submitted successfully'
    });

  } catch (error: any) {
    console.error('Failed to submit feedback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}

// GET /api/testing/feedback - Get feedback summary
export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '7');

    // Get feedback summary
    const summary = await db.manyOrNone(`
      SELECT
        tf.error_category,
        tf.error_severity,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE tf.rating = 1) as thumbs_up,
        COUNT(*) FILTER (WHERE tf.rating = -1) as thumbs_down,
        COUNT(tf.corrected_transcript) as corrections_provided,
        AVG(tr.transcript_wer) as avg_wer
      FROM ai_test_feedback tf
      JOIN ai_test_runs tr ON tr.id = tf.test_run_id
      WHERE tf.created_at >= NOW() - ($1::text || ' days')::interval
      GROUP BY tf.error_category, tf.error_severity
      ORDER BY count DESC
    `, [days]);

    // Get recent feedback
    const recent = await db.manyOrNone(`
      SELECT
        tf.*,
        tr.transcript_wer,
        tr.transcription_engine,
        tc.name as test_case_name,
        tc.test_category
      FROM ai_test_feedback tf
      JOIN ai_test_runs tr ON tr.id = tf.test_run_id
      JOIN ai_test_cases tc ON tc.id = tr.test_case_id
      WHERE tf.created_at >= NOW() - ($1::text || ' days')::interval
      ORDER BY tf.created_at DESC
      LIMIT 50
    `, [days]);

    // Get correction statistics
    const correctionStats = await db.one(`
      SELECT
        COUNT(*) as total_corrections,
        COUNT(*) FILTER (WHERE verification_status = 'verified') as verified_corrections,
        COUNT(*) FILTER (WHERE used_in_training = true) as used_in_training,
        COUNT(DISTINCT engine) as engines_covered
      FROM ai_training_corrections
      WHERE created_at >= NOW() - ($1::text || ' days')::interval
    `, [days]);

    return NextResponse.json({
      success: true,
      summary,
      recent,
      correction_stats: correctionStats
    });

  } catch (error: any) {
    console.error('Failed to fetch feedback:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}