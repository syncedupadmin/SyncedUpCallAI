import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

// POST /api/testing/create-test-case - Manually create a test case with custom audio
export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const {
      suite_id,
      name,
      audio_url,
      audio_duration_sec,
      expected_transcript,
      test_category = 'clear_speech',
      difficulty_level = 3,
      metadata = {}
    } = await req.json();

    // Validate required fields
    if (!suite_id || !name || !audio_url) {
      return NextResponse.json(
        { error: 'suite_id, name, and audio_url are required' },
        { status: 400 }
      );
    }

    // Verify suite exists
    const suite = await db.oneOrNone(`
      SELECT id, name FROM ai_test_suites WHERE id = $1 AND is_active = true
    `, [suite_id]);

    if (!suite) {
      return NextResponse.json(
        { error: 'Test suite not found' },
        { status: 404 }
      );
    }

    // Validate the audio URL
    try {
      console.log(`[Create Test Case] Validating audio URL: ${audio_url}`);

      const urlCheck = await fetch(audio_url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      const contentType = urlCheck.headers.get('content-type') || '';
      const contentLength = urlCheck.headers.get('content-length');

      if (!urlCheck.ok) {
        return NextResponse.json(
          { error: `Audio URL returned ${urlCheck.status}: ${urlCheck.statusText}` },
          { status: 400 }
        );
      }

      if (!contentType.includes('audio') && !contentType.includes('mp3') && !contentType.includes('wav')) {
        return NextResponse.json(
          { error: `Invalid audio URL: Content-Type is ${contentType}, expected audio/*` },
          { status: 400 }
        );
      }

      // Get duration from content-length if not provided (rough estimate for MP3)
      let duration = audio_duration_sec;
      if (!duration && contentLength) {
        // Rough estimate: 128kbps MP3 = 16KB per second
        duration = Math.round(parseInt(contentLength) / 16000);
      }

    } catch (urlError: any) {
      return NextResponse.json(
        { error: `Audio URL validation failed: ${urlError.message}` },
        { status: 400 }
      );
    }

    // Check if test case with same audio URL already exists
    const existing = await db.oneOrNone(`
      SELECT id, name FROM ai_test_cases
      WHERE suite_id = $1 AND audio_url = $2
    `, [suite_id, audio_url]);

    if (existing) {
      return NextResponse.json(
        { error: `Test case with this audio URL already exists: ${existing.name}` },
        { status: 409 }
      );
    }

    // Create the test case
    const testCase = await db.one(`
      INSERT INTO ai_test_cases (
        suite_id,
        name,
        audio_url,
        audio_duration_sec,
        expected_transcript,
        test_category,
        difficulty_level,
        metadata,
        source,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING *
    `, [
      suite_id,
      name,
      audio_url,
      audio_duration_sec || 60, // Default to 60 seconds if not provided
      expected_transcript,
      test_category,
      difficulty_level,
      JSON.stringify({
        ...metadata,
        created_via: 'manual_api',
        created_at: new Date().toISOString()
      }),
      'manual'
    ]);

    console.log(`[Create Test Case] Created test case ${testCase.id}: ${name}`);

    return NextResponse.json({
      success: true,
      message: 'Test case created successfully',
      test_case: testCase,
      suite_name: suite.name,
      next_steps: [
        `Test case "${name}" has been added to suite "${suite.name}"`,
        'You can now run the test suite to evaluate this test case',
        'Or add more test cases before running the suite'
      ]
    });

  } catch (error: any) {
    console.error('[Create Test Case] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create test case' },
      { status: 500 }
    );
  }
}

// GET /api/testing/create-test-case - List valid test categories and example URLs
export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    valid_categories: [
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
    ],
    difficulty_levels: {
      1: 'Very Easy - Clear speech, no background noise',
      2: 'Easy - Minor background noise or slight accent',
      3: 'Medium - Moderate challenges (default)',
      4: 'Hard - Heavy accent, noise, or multiple speakers',
      5: 'Very Hard - Extreme conditions'
    },
    example_audio_urls: [
      'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      'https://file-examples-com.github.io/uploads/2017/11/file_example_MP3_700KB.mp3',
      'https://samplelib.com/lib/preview/mp3/sample-3s.mp3'
    ],
    usage: {
      endpoint: 'POST /api/testing/create-test-case',
      required_fields: ['suite_id', 'name', 'audio_url'],
      optional_fields: [
        'audio_duration_sec',
        'expected_transcript',
        'test_category',
        'difficulty_level',
        'metadata'
      ],
      example: {
        suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
        name: 'Clear Speech Sample',
        audio_url: 'https://example.com/audio.mp3',
        expected_transcript: 'This is the expected transcript',
        test_category: 'clear_speech',
        difficulty_level: 2
      }
    }
  });
}