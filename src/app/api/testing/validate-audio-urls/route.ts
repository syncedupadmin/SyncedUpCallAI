import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

// GET /api/testing/validate-audio-urls - Check health of test case audio URLs
export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const suite_id = searchParams.get('suite_id');
    const fix = searchParams.get('fix') === 'true';

    // Get test cases with audio URLs
    const testCases = await db.manyOrNone(`
      SELECT
        tc.id,
        tc.name,
        tc.audio_url,
        tc.source_call_id,
        c.recording_url as call_recording_url,
        c.convoso_lead_id
      FROM ai_test_cases tc
      LEFT JOIN calls c ON c.id = tc.source_call_id
      WHERE tc.is_active = true
        AND tc.audio_url IS NOT NULL
        ${suite_id ? 'AND tc.suite_id = $1' : ''}
      ORDER BY tc.created_at DESC
      LIMIT 50
    `, suite_id ? [suite_id] : []);

    const results = {
      total: testCases.length,
      valid: 0,
      invalid: 0,
      fixed: 0,
      details: [] as any[]
    };

    for (const testCase of testCases) {
      const result = {
        id: testCase.id,
        name: testCase.name,
        audio_url: testCase.audio_url,
        status: 'unknown' as string,
        content_type: null as string | null,
        error: null as string | null
      };

      try {
        // Validate the audio URL
        const response = await fetch(testCase.audio_url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        });

        const contentType = response.headers.get('content-type') || '';
        result.content_type = contentType;

        if (response.ok && (contentType.includes('audio') || contentType.includes('mp3') || contentType.includes('wav'))) {
          result.status = 'valid';
          results.valid++;
        } else {
          result.status = 'invalid';
          result.error = `Invalid content-type: ${contentType}`;
          results.invalid++;

          // If fix mode and we have a call recording URL, try to update it
          if (fix && testCase.call_recording_url && testCase.call_recording_url !== testCase.audio_url) {
            try {
              // Validate the call's recording URL
              const callUrlResponse = await fetch(testCase.call_recording_url, {
                method: 'HEAD',
                signal: AbortSignal.timeout(5000)
              });

              const callContentType = callUrlResponse.headers.get('content-type') || '';

              if (callUrlResponse.ok && (callContentType.includes('audio') || callContentType.includes('mp3'))) {
                // Update the test case with the working URL
                await db.none(`
                  UPDATE ai_test_cases
                  SET audio_url = $1, updated_at = NOW()
                  WHERE id = $2
                `, [testCase.call_recording_url, testCase.id]);

                result.status = 'fixed';
                result.error = null;
                results.fixed++;
                results.invalid--;
              }
            } catch (fixError: any) {
              result.error += ` | Fix failed: ${fixError.message}`;
            }
          }
        }
      } catch (error: any) {
        result.status = 'error';
        result.error = error.message;
        results.invalid++;
      }

      results.details.push(result);
    }

    return NextResponse.json({
      success: true,
      results,
      message: fix
        ? `Validated ${results.total} test cases: ${results.valid} valid, ${results.invalid} invalid, ${results.fixed} fixed`
        : `Validated ${results.total} test cases: ${results.valid} valid, ${results.invalid} invalid`,
      recommendations: results.invalid > 0 ? [
        'Some test cases have invalid audio URLs',
        fix ? 'Attempted to fix invalid URLs using call recording URLs' : 'Run with ?fix=true to attempt automatic fixes',
        'Consider re-importing fresh calls from Convoso',
        'Or manually update test cases with valid audio URLs'
      ] : ['All test case audio URLs are valid']
    });

  } catch (error: any) {
    console.error('[Validate Audio URLs] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to validate audio URLs' },
      { status: 500 }
    );
  }
}

// POST /api/testing/validate-audio-urls - Refresh expired URLs from Convoso
export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { test_case_ids } = await req.json();

    if (!test_case_ids || !Array.isArray(test_case_ids)) {
      return NextResponse.json(
        { error: 'test_case_ids array is required' },
        { status: 400 }
      );
    }

    // Get test cases with their source calls
    const testCases = await db.manyOrNone(`
      SELECT
        tc.id,
        tc.source_call_id,
        c.convoso_lead_id,
        c.call_id
      FROM ai_test_cases tc
      JOIN calls c ON c.id = tc.source_call_id
      WHERE tc.id = ANY($1)
    `, [test_case_ids]);

    let refreshed = 0;
    const results = [];

    for (const testCase of testCases) {
      try {
        // Extract Convoso ID from call_id (format: convoso_XXXXX)
        const convosoId = testCase.call_id.replace('convoso_', '');

        // For now, we'll just mark that refresh was attempted
        // In production, you'd call Convoso API to get fresh URL
        console.log(`[Refresh URLs] Would refresh Convoso recording ${convosoId} for test case ${testCase.id}`);

        results.push({
          test_case_id: testCase.id,
          status: 'skipped',
          message: 'URL refresh not implemented yet'
        });

      } catch (error: any) {
        results.push({
          test_case_id: testCase.id,
          status: 'error',
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      refreshed,
      attempted: testCases.length,
      results,
      message: 'URL refresh endpoint ready (implementation pending)'
    });

  } catch (error: any) {
    console.error('[Refresh Audio URLs] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to refresh audio URLs' },
      { status: 500 }
    );
  }
}