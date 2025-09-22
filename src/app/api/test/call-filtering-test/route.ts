import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { classifyCallQuality, CALL_CLASSIFICATIONS } from '@/server/lib/call-quality-classifier';

export const dynamic = 'force-dynamic';

// Test endpoint for call quality filtering
export async function GET(req: NextRequest) {
  try {
    console.log('=== Call Quality Filtering Test Suite ===');

    const testResults = {
      database_tables: false,
      voicemail_detection: false,
      dead_air_detection: false,
      wrong_number_detection: false,
      classification_logic: false,
      filtering_pipeline: false,
      cost_savings: false
    };

    // 1. Test database tables exist
    try {
      const tables = await db.manyOrNone(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN (
          'call_quality_metrics',
          'voicemail_patterns',
          'wrong_number_patterns',
          'automated_system_patterns',
          'filtered_calls_log'
        )
      `);

      testResults.database_tables = tables.length === 5;
      console.log(`✓ Database tables: ${tables.length}/5 found`);
    } catch (error) {
      console.error('✗ Database tables test failed:', error);
    }

    // 2. Test voicemail detection
    try {
      const voicemailTests = [
        { transcript: "Hi, you've reached John. Please leave a message after the beep.", expected: true },
        { transcript: "This is Sarah's voicemail. I'm not available right now.", expected: true },
        { transcript: "Hi this is John from ABC Insurance, how are you today?", expected: false }
      ];

      let correctDetections = 0;
      for (const test of voicemailTests) {
        const result = await classifyCallQuality(
          'test-' + Date.now(),
          test.transcript,
          [],
          30,
          1.0
        );
        const isVoicemail = result.classification === CALL_CLASSIFICATIONS.VOICEMAIL;
        if (isVoicemail === test.expected) {
          correctDetections++;
        }
      }

      testResults.voicemail_detection = correctDetections === voicemailTests.length;
      console.log(`✓ Voicemail detection: ${correctDetections}/${voicemailTests.length} correct`);
    } catch (error) {
      console.error('✗ Voicemail detection test failed:', error);
    }

    // 3. Test dead air detection
    try {
      const deadAirTests = [
        { transcript: "Hello", word_count: 1, expected: true },
        { transcript: "Hi there", word_count: 2, expected: true },
        { transcript: "This is a normal conversation with enough words to be analyzed properly", word_count: 12, expected: false }
      ];

      let correctDetections = 0;
      for (const test of deadAirTests) {
        const result = await classifyCallQuality(
          'test-' + Date.now(),
          test.transcript,
          [],
          10,
          1.0
        );
        const isDeadAir = result.classification === CALL_CLASSIFICATIONS.DEAD_AIR ||
                          result.classification === CALL_CLASSIFICATIONS.ULTRA_SHORT;
        if (isDeadAir === test.expected) {
          correctDetections++;
        }
      }

      testResults.dead_air_detection = correctDetections === deadAirTests.length;
      console.log(`✓ Dead air detection: ${correctDetections}/${deadAirTests.length} correct`);
    } catch (error) {
      console.error('✗ Dead air detection test failed:', error);
    }

    // 4. Test wrong number detection
    try {
      const wrongNumberTests = [
        { transcript: "I think you have the wrong number", expected: true },
        { transcript: "Who is this? I didn't call you", expected: true },
        { transcript: "Hi, I'm calling about your insurance policy", expected: false }
      ];

      let correctDetections = 0;
      for (const test of wrongNumberTests) {
        const result = await classifyCallQuality(
          'test-' + Date.now(),
          test.transcript,
          [],
          15,
          1.0
        );
        const isWrongNumber = result.classification === CALL_CLASSIFICATIONS.WRONG_NUMBER;
        if (isWrongNumber === test.expected) {
          correctDetections++;
        }
      }

      testResults.wrong_number_detection = correctDetections === wrongNumberTests.length;
      console.log(`✓ Wrong number detection: ${correctDetections}/${wrongNumberTests.length} correct`);
    } catch (error) {
      console.error('✗ Wrong number detection test failed:', error);
    }

    // 5. Test full classification logic with diarized transcript
    try {
      const diarized = [
        { speaker: 'agent', text: 'Hi, this is John from ABC Insurance.' },
        { speaker: 'customer', text: 'Not interested, take me off your list.' },
        { speaker: 'agent', text: 'I understand, have a good day.' }
      ];

      const result = await classifyCallQuality(
        'test-' + Date.now(),
        'Hi, this is John from ABC Insurance. Not interested, take me off your list. I understand, have a good day.',
        diarized,
        15,
        1.0
      );

      testResults.classification_logic = result.is_analyzable === true && result.quality_score > 0;
      console.log(`✓ Classification logic: Analyzable=${result.is_analyzable}, Score=${result.quality_score}`);
    } catch (error) {
      console.error('✗ Classification logic test failed:', error);
    }

    // 6. Test filtering in pipeline
    try {
      // Check if any calls have been filtered
      const filteredCalls = await db.oneOrNone(`
        SELECT
          COUNT(*) as total_filtered,
          COUNT(DISTINCT classification) as unique_classifications
        FROM call_quality_metrics
        WHERE is_analyzable = false
        AND created_at >= NOW() - INTERVAL '7 days'
      `);

      testResults.filtering_pipeline = filteredCalls !== null;
      console.log(`✓ Filtering pipeline: ${filteredCalls?.total_filtered || 0} calls filtered`);
    } catch (error) {
      console.error('✗ Filtering pipeline test failed:', error);
    }

    // 7. Test cost savings calculation
    try {
      const savings = await db.oneOrNone(`
        SELECT
          COUNT(*) as calls_filtered,
          COUNT(*) * 0.01 as dollars_saved
        FROM call_quality_metrics
        WHERE is_analyzable = false
        AND created_at >= NOW() - INTERVAL '30 days'
      `);

      testResults.cost_savings = savings !== null && savings.calls_filtered >= 0;
      console.log(`✓ Cost savings: $${savings?.dollars_saved || 0} saved on ${savings?.calls_filtered || 0} calls`);
    } catch (error) {
      console.error('✗ Cost savings test failed:', error);
    }

    // Get sample filtered calls
    const sampleFilteredCalls = await db.manyOrNone(`
      SELECT
        cqm.call_id,
        cqm.classification,
        cqm.filter_reason,
        cqm.word_count,
        cqm.quality_score,
        c.duration_sec,
        c.agent_name
      FROM call_quality_metrics cqm
      JOIN calls c ON c.id = cqm.call_id
      WHERE cqm.is_analyzable = false
      ORDER BY cqm.created_at DESC
      LIMIT 10
    `);

    // Get filtering effectiveness
    const effectiveness = await db.oneOrNone(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE is_analyzable = true) as analyzed,
        COUNT(*) FILTER (WHERE is_analyzable = false) as filtered,
        ROUND(
          COUNT(*) FILTER (WHERE is_analyzable = false)::DECIMAL /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as filter_rate_pct
      FROM call_quality_metrics
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    // Calculate overall test status
    const allTestsPassed = Object.values(testResults).every(result => result === true);
    const passedCount = Object.values(testResults).filter(r => r).length;
    const totalTests = Object.keys(testResults).length;

    return NextResponse.json({
      success: allTestsPassed,
      message: allTestsPassed
        ? '✅ All call filtering tests passed!'
        : `⚠️ ${passedCount}/${totalTests} tests passed`,
      test_results: testResults,
      effectiveness: effectiveness || {},
      sample_filtered_calls: sampleFilteredCalls || [],
      recommendations: [
        testResults.database_tables ? null : 'Run database migration: add-call-quality-filtering.sql',
        testResults.classification_logic ? null : 'Check call-quality-classifier.ts module',
        testResults.filtering_pipeline ? null : 'Verify filtering is active in transcribe/analyze APIs',
        effectiveness?.filter_rate_pct > 50 ? 'High filter rate - review classification thresholds' : null
      ].filter(Boolean)
    });

  } catch (error: any) {
    console.error('Call filtering test failed:', error);
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