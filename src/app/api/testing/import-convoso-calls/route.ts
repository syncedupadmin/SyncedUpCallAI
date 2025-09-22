import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minute timeout for fetching from Convoso

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
      limit = 10,
      min_duration = 10,
      max_duration = 300
    } = await req.json();

    if (!suite_id) {
      return NextResponse.json(
        { error: 'suite_id is required' },
        { status: 400 }
      );
    }

    // Check Convoso credentials
    const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;
    if (!CONVOSO_AUTH_TOKEN) {
      return NextResponse.json(
        { error: 'Convoso AUTH_TOKEN not configured' },
        { status: 500 }
      );
    }

    console.log('[Convoso Import] Fetching recent calls from Convoso...');

    // Step 1: Get recent calls from Convoso using the working /log/retrieve endpoint
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days_back);
    const endDate = new Date();

    // Format dates exactly like the working ConvosoService
    const formatDateTime = (date: Date, isEnd: boolean = false) => {
      const dateStr = date.toISOString().split('T')[0];
      return isEnd ? `${dateStr} 23:59:59` : `${dateStr} 00:00:00`;
    };

    const params = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN,
      start_time: formatDateTime(startDate),
      end_time: formatDateTime(endDate, true),
      include_recordings: '1',
      limit: String(limit * 2), // Get extra to filter
      offset: '0'
    });

    const convosoUrl = `https://api.convoso.com/v1/log/retrieve?${params.toString()}`;

    const convosoResponse = await fetch(convosoUrl);

    if (!convosoResponse.ok) {
      const errorText = await convosoResponse.text();
      console.error('[Convoso Import] API error:', errorText);
      return NextResponse.json(
        { error: `Convoso API error: ${convosoResponse.status}` },
        { status: 502 }
      );
    }

    const convosoData = await convosoResponse.json();

    // Check for API error (matching ConvosoService)
    if (convosoData.success === false) {
      console.error('[Convoso Import] API returned failure:', convosoData.text);
      return NextResponse.json(
        { error: convosoData.text || 'Convoso API returned failure' },
        { status: 502 }
      );
    }

    const convosoCalls = convosoData.data?.results || [];

    if (convosoCalls.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No recent calls found in Convoso',
        imported: 0
      });
    }

    // Step 2: Filter calls suitable for testing (matching log/retrieve format)
    const testCandidates = convosoCalls.filter((call: any) => {
      // Parse duration - it might be null, string, or number
      const duration = call.call_length ? parseInt(call.call_length) : 0;

      // Check for recording URL in various formats
      const hasRecording = call.recording && call.recording.length > 0 &&
                          (call.recording[0].public_url ||
                           call.recording[0].src ||
                           call.recording[0].url);

      // Skip certain dispositions but be less restrictive
      const skipDispositions = ['Call in Progress', 'No Answer AutoDial'];
      const disposition = call.status_name || call.status || '';

      // Allow calls with valid duration OR valid recording
      // Be more lenient to get some test data
      return hasRecording &&
             !skipDispositions.includes(disposition) &&
             (duration === 0 || (duration >= min_duration && duration <= max_duration));
    }).slice(0, limit);

    console.log(`[Convoso Import] Found ${testCandidates.length} suitable calls for testing`);

    // Step 3: Import each call
    const imported = [];
    const failed = [];

    for (const convosoCall of testCandidates) {
      try {
        // First, check if this call already exists in our system
        // Extract recording URL from log/retrieve format
        const recordingUrl = convosoCall.recording?.[0]?.public_url ||
                           convosoCall.recording?.[0]?.src ||
                           convosoCall.recording?.[0]?.url || '';
        const convosoCallId = convosoCall.recording?.[0]?.recording_id || convosoCall.id;

        const existingCall = await db.oneOrNone(`
          SELECT id FROM calls
          WHERE convoso_call_id = $1
          OR (recording_url = $2 AND recording_url IS NOT NULL)
        `, [convosoCallId, recordingUrl]);

        let callId;

        if (existingCall) {
          callId = existingCall.id;
          console.log(`[Convoso Import] Call ${convosoCallId} already exists as ${callId}`);
        } else {
          // Create a new call record (using log/retrieve data structure)
          const newCall = await db.one(`
            INSERT INTO calls (
              convoso_call_id,
              recording_url,
              duration_sec,
              agent_name,
              campaign,
              disposition,
              direction,
              started_at,
              created_at,
              is_test
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), false)
            RETURNING id
          `, [
            convosoCallId,
            recordingUrl,
            convosoCall.call_length ? parseInt(convosoCall.call_length) : 30, // Default to 30 seconds if null
            convosoCall.user || 'Unknown',
            convosoCall.campaign || 'Unknown Campaign',
            convosoCall.status_name || convosoCall.status || 'UNKNOWN',
            'outbound',
            convosoCall.call_date || new Date().toISOString()
          ]);
          callId = newCall.id;
          console.log(`[Convoso Import] Created new call ${callId} from Convoso ${convosoCallId}`);

          // Trigger transcription
          await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/jobs/transcribe`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.JOBS_SECRET}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              callId: callId,
              recordingUrl: recordingUrl
            })
          });
        }

        // Check if already imported as test case
        const existingTestCase = await db.oneOrNone(`
          SELECT id FROM ai_test_cases
          WHERE source_call_id = $1
        `, [callId]);

        if (existingTestCase) {
          console.log(`[Convoso Import] Call ${callId} already imported as test case`);
          continue;
        }

        // Create test case
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
          `Convoso Call - ${convosoCall.user || 'Unknown'} - ${convosoCall.status_name || 'Unknown'}`,
          recordingUrl,
          convosoCall.call_length ? parseInt(convosoCall.call_length) : 30,
          determineTestCategory(convosoCall),
          JSON.stringify({
            convoso_call_id: convosoCallId,
            agent: convosoCall.user,
            campaign: convosoCall.campaign,
            disposition: convosoCall.status_name || convosoCall.status,
            phone: convosoCall.phone_number,
            lead_id: convosoCall.lead_id,
            imported_from: 'convoso_direct'
          }),
          3, // Medium difficulty by default
          'convoso_import',
          callId
        ]);

        imported.push({
          test_case_id: testCase.id,
          call_id: callId,
          convoso_id: convosoCallId,
          agent: convosoCall.user,
          duration: convosoCall.call_length ? parseInt(convosoCall.call_length) : 30
        });

      } catch (error: any) {
        const failedCallId = convosoCall.recording?.[0]?.recording_id || convosoCall.id;
        console.error(`[Convoso Import] Failed to import call ${failedCallId}:`, error);
        failed.push({
          convoso_id: failedCallId,
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
        'Calls are being transcribed in the background',
        'Run tests once transcription completes (usually 10-30 seconds)',
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
    // Check if Convoso credentials are configured
    const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;
    const hasCredentials = !!CONVOSO_AUTH_TOKEN;

    if (!hasCredentials) {
      return NextResponse.json({
        connected: false,
        message: 'Convoso AUTH_TOKEN not configured',
        setup_instructions: [
          '1. Add CONVOSO_AUTH_TOKEN to your .env.local',
          '2. The token should be: 8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p',
          '3. Restart the development server'
        ]
      });
    }

    // Test the connection using a simple API call
    const params = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN,
      limit: '1',
      offset: '0'
    });

    const testResponse = await fetch(`https://api.convoso.com/v1/log/retrieve?${params.toString()}`);

    if (testResponse.ok) {
      const data = await testResponse.json();
      if (data.success !== false) {
        return NextResponse.json({
          connected: true,
          message: 'Convoso API connected successfully',
          account: 'Connected'
        });
      } else {
        return NextResponse.json({
          connected: false,
          message: `Convoso API error: ${data.text || 'Authentication failed'}`,
          error: data.text
        });
      }
    } else {
      return NextResponse.json({
        connected: false,
        message: `Convoso API connection failed: ${testResponse.status}`,
        error: await testResponse.text()
      });
    }

  } catch (error: any) {
    return NextResponse.json({
      connected: false,
      message: 'Failed to check Convoso connection',
      error: error.message
    });
  }
}

/**
 * Determine test category based on call characteristics
 */
function determineTestCategory(call: any): string {
  const duration = call.call_length ? parseInt(call.call_length) : 30;

  if (duration < 15) return 'rejection_immediate';
  if (duration < 30) return 'short_call';
  if (duration > 180) return 'long_conversation';

  const disposition = call.status_name || call.status || '';
  if (disposition === 'Sale' || disposition === 'SOLD') return 'successful_sale';
  if (disposition === 'Callback') return 'callback_scheduled';
  if (disposition === 'Not Interested') return 'rejection_handled';

  return 'multiple_speakers'; // Default category
}