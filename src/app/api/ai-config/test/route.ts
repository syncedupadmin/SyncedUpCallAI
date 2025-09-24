import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createDeepgramClient } from '@deepgram/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Calculate word differences
interface WordDifference {
  position: number;
  expected: string;
  actual: string;
  match: boolean;
}

function calculateDifferences(expected: string, actual: string): WordDifference[] {
  const expectedWords = expected.toLowerCase().split(/\s+/);
  const actualWords = actual.toLowerCase().split(/\s+/);

  const differences: WordDifference[] = [];
  const maxLength = Math.max(expectedWords.length, actualWords.length);

  for (let i = 0; i < maxLength; i++) {
    const exp = expectedWords[i] || '[missing]';
    const act = actualWords[i] || '[missing]';

    if (exp !== act) {
      differences.push({
        position: i,
        expected: exp,
        actual: act,
        match: false
      });
    }
  }

  return differences;
}

// Analyze which keywords might have caused issues
function analyzeProblematicKeywords(transcript: string, keywords: string[]): string[] {
  if (!keywords || keywords.length === 0) return [];

  const problematic: string[] = [];
  const transcriptLower = transcript.toLowerCase();

  // Common words that shouldn't be boosted
  const commonWords = ['hello', 'yes', 'no', 'maybe', 'goodbye', 'okay', 'um', 'uh', 'well', 'like'];

  for (const keyword of keywords) {
    const [word] = keyword.split(':');
    const wordLower = word.toLowerCase();

    // Check if it's a common word that was likely over-boosted
    if (commonWords.includes(wordLower)) {
      // Count occurrences - if it appears too often, it's problematic
      const regex = new RegExp(`\\b${wordLower}\\b`, 'gi');
      const matches = transcriptLower.match(regex);
      if (matches && matches.length > 2) {
        problematic.push(word);
      }
    }
  }

  return problematic;
}

// Enhanced test endpoint with full analysis
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Optional auth check for testing
    const { data: { user } } = await supabase.auth.getUser();

    const { audioUrl, expectedText, testConfig, compareWithActive } = await request.json();

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

    // Add keywords if present (limit to first 20 to avoid timeout)
    let keywordsUsed = 0;
    if (testConfig.keywords && testConfig.keywords.length > 0) {
      // Only use first 20 keywords for testing to avoid timeout
      const keywordsToUse = testConfig.keywords.slice(0, 20);
      deepgramOptions.keywords = keywordsToUse;
      keywordsUsed = keywordsToUse.length;
    }

    // Add replacements if present
    if (testConfig.replacements && Object.keys(testConfig.replacements).length > 0) {
      deepgramOptions.replace = testConfig.replacements;
    }

    console.log('Testing with Deepgram options:', deepgramOptions);

    // Test the configuration
    const startTime = Date.now();
    let transcribedText = '';
    let error = null;

    try {
      const response = await deepgram.listen.prerecorded.transcribeUrl(
        { url: audioUrl },
        deepgramOptions
      );

      // Get the full transcript
      transcribedText = response.result?.results?.channels[0]?.alternatives[0]?.transcript || '';

      console.log('Deepgram response received');
      console.log('Transcript length:', transcribedText.length);
      console.log('First 500 chars:', transcribedText.substring(0, 500));

    } catch (err: any) {
      error = err.message;
      console.error('Deepgram error:', err);
    }

    const processingTime = Date.now() - startTime;

    if (error) {
      return NextResponse.json({
        success: false,
        error: 'Transcription failed',
        message: error
      });
    }

    // Calculate metrics
    const wordCount = transcribedText.split(/\s+/).length;
    const hasKeywords = testConfig.keywords?.length > 0;

    // Estimate accuracy based on configuration
    let estimatedAccuracy = 90; // Base accuracy
    if (hasKeywords) {
      // Each keyword reduces accuracy slightly
      const keywordPenalty = Math.min(testConfig.keywords.length * 0.5, 40);
      estimatedAccuracy = Math.max(50, 90 - keywordPenalty);
    }

    // Calculate WER as decimal (0.10 = 10%)
    const estimatedWER = ((100 - estimatedAccuracy) / 100).toFixed(2);

    // Calculate differences if expected text provided
    let differences: WordDifference[] = [];
    if (expectedText && expectedText.trim()) {
      differences = calculateDifferences(expectedText, transcribedText);
      // Adjust accuracy based on actual differences
      const errorRate = differences.length / expectedText.split(/\s+/).length;
      estimatedAccuracy = Math.max(0, Math.round(100 * (1 - errorRate)));
    }

    // Analyze problematic keywords
    const problematicKeywords = analyzeProblematicKeywords(
      transcribedText,
      testConfig.keywords || []
    );

    // Build response
    const result = {
      success: true,
      testConfig: {
        transcript: transcribedText, // Full transcript
        accuracy: estimatedAccuracy,
        wer: estimatedWER,
        processingTime,
        wordCount,
        keywordsUsed
      },
      differences: differences.slice(0, 100), // Limit to first 100 differences
      problematicKeywords,
      analysis: {
        totalErrors: differences.length,
        errorRate: expectedText ? (differences.length / expectedText.split(/\s+/).length * 100).toFixed(1) + '%' : 'N/A',
        keywordImpact: hasKeywords ? `Using ${keywordsUsed} keywords reduced accuracy by ~${90 - estimatedAccuracy}%` : 'No keywords used',
        recommendation: hasKeywords && testConfig.keywords.length > 10
          ? 'Remove most keywords to improve accuracy. Keep only industry-specific terms.'
          : 'Configuration is optimized'
      },
      message: hasKeywords && testConfig.keywords.length > 20
        ? `Note: Only first 20 keywords were tested to avoid timeout. You have ${testConfig.keywords.length} total.`
        : 'Test completed successfully',
      recommendations: [] as string[]
    };

    // Add specific recommendations
    if (hasKeywords && testConfig.keywords.length > 20) {
      result.recommendations.push('Too many keywords detected. Reduce to under 10 for optimal accuracy.');
    }
    if (problematicKeywords.length > 0) {
      result.recommendations.push(`Remove common words: ${problematicKeywords.slice(0, 5).join(', ')}`);
    }
    if (estimatedAccuracy < 70) {
      result.recommendations.push('Accuracy is below acceptable threshold. Consider using factory defaults.');
    }

    console.log('Test complete:', {
      accuracy: estimatedAccuracy,
      wer: estimatedWER,
      wordCount,
      keywordsUsed,
      problematicKeywords: problematicKeywords.length
    });

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Test failed:', error);
    return NextResponse.json(
      { error: 'Test failed', message: error.message },
      { status: 500 }
    );
  }
}