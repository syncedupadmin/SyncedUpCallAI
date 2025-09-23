import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/testing/bulk-create - Create test cases from a list of audio URLs
export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const {
      suite_id = '876b6b65-ddaa-42fe-aecd-80457cb66035',
      audio_urls, // Array of URLs
      base_url,   // Or a base URL + list of filenames
      filenames   // List of filenames if using base_url
    } = await req.json();

    console.log('[Bulk Create] Creating test cases...');

    const imported = [];
    const failed = [];

    // Build URL list
    let urls = [];
    if (audio_urls && Array.isArray(audio_urls)) {
      urls = audio_urls;
    } else if (base_url && filenames && Array.isArray(filenames)) {
      urls = filenames.map(fn => `${base_url}/${fn}`);
    } else {
      return NextResponse.json(
        { error: 'Provide either audio_urls array or base_url + filenames array' },
        { status: 400 }
      );
    }

    console.log(`[Bulk Create] Processing ${urls.length} URLs`);

    // Create test cases for each URL
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const filename = url.split('/').pop() || `test-${i}`;

      try {
        // Check if test case already exists for this URL
        const existing = await db.oneOrNone(`
          SELECT id FROM ai_test_cases
          WHERE audio_url = $1
        `, [url]);

        if (existing) {
          console.log(`[Bulk Create] Test case already exists for ${filename}`);
          continue;
        }

        // Create new test case
        const testCase = await db.one(`
          INSERT INTO ai_test_cases (
            suite_id,
            name,
            audio_url,
            audio_duration_sec,
            test_category,
            metadata,
            difficulty_level,
            source,
            is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
          RETURNING id
        `, [
          suite_id,
          `Call ${i + 1} - ${filename.replace('.mp3', '').replace('.wav', '')}`,
          url,
          30, // Default duration
          'phone_quality',
          JSON.stringify({
            original_filename: filename,
            batch_import: true,
            imported_at: new Date().toISOString()
          }),
          3, // Medium difficulty
          'bulk_upload'
        ]);

        imported.push({
          test_case_id: testCase.id,
          url: url,
          name: filename
        });

        // Queue for transcription
        await db.none(`
          INSERT INTO transcription_queue (
            call_id,
            recording_url,
            status,
            priority,
            source,
            created_at
          ) VALUES ($1, $2, 'pending', 2, 'ai_testing', NOW())
          ON CONFLICT (call_id) DO NOTHING
        `, [`test_${testCase.id}`, url]);

      } catch (error: any) {
        console.error(`[Bulk Create] Failed to create test case for ${url}:`, error);
        failed.push({
          url: url,
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${imported.length} test cases from ${urls.length} URLs`,
      imported: imported.length,
      failed: failed.length,
      details: {
        imported: imported.slice(0, 10), // Only show first 10 for brevity
        failed,
        total_processed: urls.length
      }
    });

  } catch (error: any) {
    console.error('[Bulk Create] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create test cases' },
      { status: 500 }
    );
  }
}