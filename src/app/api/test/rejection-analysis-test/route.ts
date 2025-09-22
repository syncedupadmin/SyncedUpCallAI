import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { analyzeRejectionCall, saveRejectionAnalysis, detectCallTier, detectRejectionType } from '@/server/lib/rejection-analyzer';

export const dynamic = 'force-dynamic';

// Test endpoint for rejection analysis
export async function GET(req: NextRequest) {
  try {
    console.log('=== Rejection Analysis Test Suite ===');

    const testResults = {
      database_tables: false,
      rejection_detection: false,
      tier_detection: false,
      analysis_flow: false,
      opening_integration: false,
      metrics_api: false
    };

    // 1. Test database tables exist
    try {
      const tables = await db.manyOrNone(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('rejection_analysis', 'agent_rejection_performance', 'rebuttal_patterns')
      `);

      testResults.database_tables = tables.length === 3;
      console.log('✓ Database tables:', tables.map(t => t.table_name).join(', '));
    } catch (error) {
      console.error('✗ Database tables test failed:', error);
    }

    // 2. Test rejection detection logic
    try {
      const testTranscripts = [
        { text: "I'm not interested, take me off your list", expected: 'not_interested' },
        { text: "I don't have time for this right now", expected: 'no_time' },
        { text: "I already have insurance coverage", expected: 'already_have' },
        { text: "Stop calling me, how did you get my number?", expected: 'spam_fear' }
      ];

      let detectionsCorrect = 0;
      for (const test of testTranscripts) {
        const result = detectRejectionType(test.text);
        if (result?.type === test.expected) {
          detectionsCorrect++;
        }
      }

      testResults.rejection_detection = detectionsCorrect === testTranscripts.length;
      console.log(`✓ Rejection detection: ${detectionsCorrect}/${testTranscripts.length} correct`);
    } catch (error) {
      console.error('✗ Rejection detection test failed:', error);
    }

    // 3. Test call tier detection
    try {
      const tierTests = [
        { duration: 5, expected: 'immediate_rejection' },
        { duration: 20, expected: 'short_rejection' },
        { duration: 60, expected: 'pitched_after_rejection' },
        { duration: 180, expected: 'full_conversation' }
      ];

      let tiersCorrect = 0;
      for (const test of tierTests) {
        const tier = detectCallTier(test.duration);
        if (tier === test.expected) {
          tiersCorrect++;
        }
      }

      testResults.tier_detection = tiersCorrect === tierTests.length;
      console.log(`✓ Tier detection: ${tiersCorrect}/${tierTests.length} correct`);
    } catch (error) {
      console.error('✗ Tier detection test failed:', error);
    }

    // 4. Test full analysis flow with mock data
    try {
      const mockCall = {
        id: 'test-' + Date.now(),
        duration_sec: 8,
        transcript: "Agent: Hi, this is John from ABC Insurance. Customer: Not interested, bye.",
        diarized: [
          { speaker: 'agent', text: 'Hi, this is John from ABC Insurance.' },
          { speaker: 'customer', text: 'Not interested, bye.' }
        ],
        agent_id: 'test-agent',
        agent_name: 'John Test',
        campaign: 'Test Campaign',
        disposition: 'NO_SALE'
      };

      const analysis = await analyzeRejectionCall(mockCall);

      testResults.analysis_flow =
        analysis.rejection_detected === true &&
        analysis.rejection_type === 'not_interested' &&
        analysis.call_tier === 'immediate_rejection' &&
        analysis.opening_delivered === 'partial';

      console.log('✓ Analysis flow test:', {
        rejection_detected: analysis.rejection_detected,
        rejection_type: analysis.rejection_type,
        tier: analysis.call_tier,
        opening: analysis.opening_delivered
      });
    } catch (error) {
      console.error('✗ Analysis flow test failed:', error);
    }

    // 5. Test opening segments integration
    try {
      const openingWithRejection = await db.oneOrNone(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE rejection_detected = true) as with_rejection
        FROM opening_segments
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `);

      testResults.opening_integration = openingWithRejection !== null;
      console.log('✓ Opening integration:', openingWithRejection);
    } catch (error) {
      console.error('✗ Opening integration test failed:', error);
    }

    // 6. Test rejection metrics API
    try {
      const metricsResponse = await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/admin/openings/rejection-metrics`, {
        headers: req.headers as any
      });

      if (metricsResponse.ok) {
        const metrics = await metricsResponse.json();
        testResults.metrics_api = metrics.success === true;
        console.log('✓ Metrics API test: Success');
      }
    } catch (error) {
      console.error('✗ Metrics API test failed:', error);
    }

    // Get sample data for verification
    const sampleRejectionCalls = await db.manyOrNone(`
      SELECT
        ra.*,
        c.duration_sec,
        c.agent_name
      FROM rejection_analysis ra
      JOIN calls c ON c.id = ra.call_id
      WHERE ra.rejection_detected = true
      ORDER BY ra.created_at DESC
      LIMIT 5
    `);

    const summary = await db.oneOrNone(`
      SELECT
        COUNT(*) as total_analyzed,
        COUNT(*) FILTER (WHERE rejection_detected = true) as rejections_found,
        COUNT(*) FILTER (WHERE rebuttal_attempted = true) as rebuttals_attempted,
        COUNT(*) FILTER (WHERE led_to_pitch = true) as led_to_pitch,
        ROUND(AVG(professionalism_score), 1) as avg_professionalism,
        ROUND(AVG(rebuttal_quality_score), 1) as avg_rebuttal_quality
      FROM rejection_analysis
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    // Calculate overall test status
    const allTestsPassed = Object.values(testResults).every(result => result === true);
    const passedCount = Object.values(testResults).filter(r => r).length;
    const totalTests = Object.keys(testResults).length;

    return NextResponse.json({
      success: allTestsPassed,
      message: allTestsPassed
        ? '✅ All rejection analysis tests passed!'
        : `⚠️ ${passedCount}/${totalTests} tests passed`,
      test_results: testResults,
      sample_data: {
        recent_rejections: sampleRejectionCalls,
        last_24h_summary: summary
      },
      recommendations: [
        testResults.database_tables ? null : 'Run database migration: add-rejection-analysis-system.sql',
        testResults.analysis_flow ? null : 'Check rejection-analyzer.ts module',
        testResults.opening_integration ? null : 'Verify opening-extractor.ts updates',
        testResults.metrics_api ? null : 'Check rejection metrics API endpoints'
      ].filter(Boolean)
    });

  } catch (error: any) {
    console.error('Rejection analysis test failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Test suite failed',
        stack: error.stack
      },
      { status: 500 }
    );
  }
}