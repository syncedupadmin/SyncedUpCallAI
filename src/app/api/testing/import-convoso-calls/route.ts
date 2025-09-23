import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { ConvosoService } from '@/lib/convoso-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/testing/import-convoso-calls - Import recent calls from Convoso for testing
export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const {
      suite_id,
      days_back = 1,
      limit = 10
    } = await req.json();

    if (!suite_id) {
      return NextResponse.json(
        { error: 'suite_id is required' },
        { status: 400 }
      );
    }

    console.log('[Convoso Import] Starting import for AI testing...');

    // Step 1: Use ConvosoService to fetch calls (the WORKING method)
    const service = new ConvosoService();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days_back);

    // Format dates for ConvosoService
    const dateFrom = startDate.toISOString().split('T')[0];
    const dateTo = endDate.toISOString().split('T')[0];

    console.log(`[Convoso Import] Fetching calls from ${dateFrom} to ${dateTo}`);

    // Use the EXACT same method that works in production
    const callData = await service.fetchCompleteCallData(dateFrom, dateTo);

    if (!callData || callData.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No recent calls found in Convoso',
        imported: 0
      });
    }

    // Filter for calls with recordings and reasonable duration
    const validCalls = callData
      .filter(call =>
        call.recording_url &&
        call.duration_seconds > 0 &&
        !call.disposition.includes('Call in Progress')
      )
      .slice(0, limit);

    console.log(`[Convoso Import] Found ${validCalls.length} valid calls for testing`);

    // Step 2: Save calls to database using ConvosoService's method
    const savedCount = await service.saveCallsToDatabase(validCalls, 'ai-testing-import');

    console.log(`[Convoso Import] Saved ${savedCount} calls to database`);

    // Step 3: Create test cases that REFERENCE the saved calls
    const imported = [];
    const failed = [];

    for (const call of validCalls) {
      try {
        // Find the saved call in database
        const savedCall = await db.oneOrNone(`
          SELECT id, recording_url, duration_sec
          FROM calls
          WHERE call_id = $1
        `, [`convoso_${call.recording_id}`]);

        if (!savedCall) {
          console.warn(`[Convoso Import] Could not find saved call for ${call.recording_id}`);
          continue;
        }

        // Check if test case already exists for this call
        const existingTestCase = await db.oneOrNone(`
          SELECT id FROM ai_test_cases
          WHERE source_call_id = $1
        `, [savedCall.id]);

        if (existingTestCase) {
          console.log(`[Convoso Import] Test case already exists for call ${savedCall.id}`);
          continue;
        }

        // Create test case that REFERENCES the call (not duplicate the URL)
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
            source_call_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `, [
          suite_id,
          `Convoso Call - ${call.agent_name} - ${call.disposition}`,
          savedCall.recording_url, // Use the URL from the saved call
          savedCall.duration_sec || call.duration_seconds,
          determineTestCategory(call),
          JSON.stringify({
            convoso_recording_id: call.recording_id,
            agent: call.agent_name,
            campaign: call.campaign_name,
            disposition: call.disposition,
            imported_at: new Date().toISOString()
          }),
          3, // Medium difficulty by default
          'convoso_import',
          savedCall.id // Reference to the actual call record
        ]);

        // Queue the call for transcription if not already done
        await db.none(`
          INSERT INTO transcription_queue (
            call_id,
            status,
            priority,
            source,
            created_at
          ) VALUES ($1, 'pending', 2, 'ai_testing', NOW())
          ON CONFLICT (call_id) DO NOTHING
        `, [savedCall.id]);

        imported.push({
          test_case_id: testCase.id,
          call_id: savedCall.id,
          convoso_id: call.recording_id,
          agent: call.agent_name,
          duration: call.duration_seconds
        });

      } catch (error: any) {
        console.error(`[Convoso Import] Failed to create test case:`, error);
        failed.push({
          convoso_id: call.recording_id,
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${imported.length} calls from Convoso`,
      imported: imported.length,
      failed: failed.length,
      details: {
        imported,
        failed
      },
      next_steps: [
        'Calls are being transcribed using the production pipeline',
        'Run tests once transcription completes',
        'View results in the Testing Dashboard'
      ]
    });

  } catch (error: any) {
    console.error('[Convoso Import] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import Convoso calls' },
      { status: 500 }
    );
  }
}

// GET /api/testing/import-convoso-calls - Check Convoso connection
export async function GET(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Use ConvosoService to check connection
    const service = new ConvosoService();
    const settings = await service.getControlSettings();

    const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;
    const hasCredentials = !!CONVOSO_AUTH_TOKEN;

    if (!hasCredentials) {
      return NextResponse.json({
        connected: false,
        message: 'Convoso AUTH_TOKEN not configured',
        setup_instructions: [
          '1. Add CONVOSO_AUTH_TOKEN to your .env.local',
          '2. Restart the development server'
        ]
      });
    }

    return NextResponse.json({
      connected: true,
      message: 'Convoso API connected successfully',
      settings: {
        system_enabled: settings.system_enabled,
        configured: true
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      connected: false,
      message: 'Failed to check Convoso connection',
      error: error.message
    });
  }
}

/**
 * Determine test category based on call characteristics - using valid enum values
 */
function determineTestCategory(call: any): string {
  const duration = call.duration_seconds || 30;
  const disposition = call.disposition || '';

  // Map to VALID test categories from the database
  if (duration < 5) return 'dead_air';
  if (duration < 15) return 'rejection_immediate';

  // Map dispositions to valid categories
  if (disposition.toLowerCase().includes('voicemail')) return 'voicemail';
  if (disposition.toLowerCase().includes('wrong')) return 'wrong_number';
  if (disposition.toLowerCase().includes('not interested') || disposition.toLowerCase().includes('no')) {
    return duration > 30 ? 'rejection_with_rebuttal' : 'rejection_immediate';
  }

  // Default to phone_quality since all Convoso calls are phone calls
  return 'phone_quality';
}