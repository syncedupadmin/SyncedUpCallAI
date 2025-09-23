import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/server/db';
import { createClient as createDeepgramClient } from '@deepgram/sdk';
import { calculateWER } from '@/lib/wer-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Test configuration without affecting production
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { audioUrl, expectedText, testConfig, compareWithActive = true } = await request.json();

    if (!audioUrl || !testConfig) {
      return NextResponse.json(
        { error: 'Audio URL and test configuration required' },
        { status: 400 }
      );
    }

    // Initialize Deepgram
    const deepgram = createDeepgramClient(process.env.DEEPGRAM_API_KEY!);

    // Build Deepgram options from test config
    const deepgramOptions: any = {
      model: testConfig.model || 'nova-2-phonecall',
      language: testConfig.language || 'en-US',
      punctuate: testConfig.punctuate !== false,
      diarize: testConfig.diarize !== false,
      smart_format: testConfig.smart_format !== false,
      utterances: testConfig.utterances !== false,
      numerals: testConfig.numerals !== false,
      profanity_filter: testConfig.profanity_filter || false
    };

    // Add keywords if present
    if (testConfig.keywords && testConfig.keywords.length > 0) {
      deepgramOptions.keywords = testConfig.keywords;
    }

    // Add replacements if present
    if (testConfig.replacements && Object.keys(testConfig.replacements).length > 0) {
      deepgramOptions.replace = testConfig.replacements;
    }

    // Test the configuration
    const startTime = Date.now();
    const response = await deepgram.listen.prerecorded.transcribeUrl(
      { url: audioUrl },
      deepgramOptions
    );

    const processingTime = Date.now() - startTime;
    const transcribedText = response.result?.results?.channels[0]?.alternatives[0]?.transcript || '';

    // Calculate metrics
    let accuracy = 100;
    let wer = 0;
    let differences = [];

    if (expectedText) {
      const werResult = calculateWER(expectedText, transcribedText);
      accuracy = werResult.accuracy;
      wer = werResult.wer;

      // Calculate word-by-word differences
      const expectedWords = expectedText.split(' ');
      const actualWords = transcribedText.split(' ');
      differences = expectedWords.map((word: string, i: number) => ({
        position: i,
        expected: word,
        actual: actualWords[i] || '[missing]',
        match: word.toLowerCase() === (actualWords[i] || '').toLowerCase()
      })).filter((d: any) => !d.match);
    }

    // Compare with active config if requested
    let activeConfigResult = null;
    if (compareWithActive) {
      // Get active configuration
      const activeConfig = await db.oneOrNone(`
        SELECT config FROM ai_configurations
        WHERE is_active = true
        LIMIT 1
      `);

      if (activeConfig) {
        // Test with active config
        const activeOptions: any = {
          model: activeConfig.config.model || 'nova-2-phonecall',
          language: activeConfig.config.language || 'en-US',
          punctuate: activeConfig.config.punctuate !== false,
          diarize: activeConfig.config.diarize !== false,
          smart_format: activeConfig.config.smart_format !== false,
          utterances: activeConfig.config.utterances !== false,
          numerals: activeConfig.config.numerals !== false,
          profanity_filter: activeConfig.config.profanity_filter || false
        };

        if (activeConfig.config.keywords?.length > 0) {
          activeOptions.keywords = activeConfig.config.keywords;
        }

        if (activeConfig.config.replacements && Object.keys(activeConfig.config.replacements).length > 0) {
          activeOptions.replace = activeConfig.config.replacements;
        }

        const activeResponse = await deepgram.listen.prerecorded.transcribeUrl(
          { url: audioUrl },
          activeOptions
        );

        const activeTranscript = activeResponse.result?.results?.channels[0]?.alternatives[0]?.transcript || '';

        if (expectedText) {
          const activeWerResult = calculateWER(expectedText, activeTranscript);
          activeConfigResult = {
            transcript: activeTranscript,
            accuracy: activeWerResult.accuracy,
            wer: activeWerResult.wer,
            processingTime: Date.now() - startTime - processingTime
          };
        }
      }
    }

    // Save test result if config exists
    let testId = null;
    const configId = testConfig.id;
    if (configId) {
      const testResult = await db.one(`
        INSERT INTO ai_config_tests (
          config_id,
          test_audio_url,
          expected_text,
          actual_text,
          accuracy,
          wer,
          processing_time,
          word_count,
          differences,
          tested_by,
          test_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        configId,
        audioUrl,
        expectedText || null,
        transcribedText,
        accuracy,
        wer / 100,
        processingTime,
        transcribedText.split(' ').length,
        JSON.stringify(differences),
        user.id,
        'manual'
      ]);
      testId = testResult.id;
    }

    // Determine if test config is better
    const betterThanActive = activeConfigResult
      ? accuracy > activeConfigResult.accuracy
      : null;

    // Generate recommendations
    const recommendations = [];
    if (accuracy < 70) {
      recommendations.push('Accuracy is below acceptable threshold (70%)');
    }
    if (testConfig.keywords?.length > 20) {
      recommendations.push('Reduce keyword count - too many keywords can hurt accuracy');
    }
    if (betterThanActive === false) {
      recommendations.push('Test configuration performs worse than active configuration');
    }
    if (betterThanActive === true) {
      recommendations.push('Test configuration performs better - consider activating');
    }

    return NextResponse.json({
      success: true,
      testId,
      testConfig: {
        transcript: transcribedText,
        accuracy: parseFloat(accuracy.toFixed(2)),
        wer: parseFloat(wer.toFixed(3)),
        processingTime,
        wordCount: transcribedText.split(' ').length
      },
      activeConfig: activeConfigResult,
      comparison: {
        betterThanActive,
        accuracyDelta: activeConfigResult
          ? parseFloat((accuracy - activeConfigResult.accuracy).toFixed(2))
          : null,
        werDelta: activeConfigResult
          ? parseFloat((wer - activeConfigResult.wer).toFixed(3))
          : null
      },
      differences: differences.slice(0, 50), // Limit to first 50 differences
      problematicWords: differences
        .filter((d: any) => !d.match)
        .map((d: any) => d.expected)
        .slice(0, 20),
      recommendations
    });

  } catch (error: any) {
    console.error('Configuration test failed:', error);
    return NextResponse.json(
      { error: 'Configuration test failed', message: error.message },
      { status: 500 }
    );
  }
}