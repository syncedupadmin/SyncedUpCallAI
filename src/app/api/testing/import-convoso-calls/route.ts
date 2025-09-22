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
      limit = 10
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

    // Fetch more calls to find ones with recordings (most don't have recordings)
    const fetchLimit = 100;  // Balanced to avoid timeout but get enough calls
    const params = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN,
      start_time: formatDateTime(startDate),
      end_time: formatDateTime(endDate, true),
      include_recordings: '1',
      limit: String(fetchLimit),
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
    const totalFound = convosoData.data?.total_found || 0;

    console.log(`[Convoso Import] Found ${totalFound} total calls, fetched ${convosoCalls.length} in this page`);

    if (convosoCalls.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No recent calls found in Convoso',
        imported: 0
      });
    }

    // Step 2: Filter calls suitable for testing - BE VERY LENIENT like the working system
    let callsWithRecordings = 0;
    let callsInProgress = 0;

    const testCandidates = convosoCalls.filter((call: any) => {
      // Check for ANY recording URL format (like the working system: src/app/api/convoso/search-by-agent/route.ts:79)
      const hasRecording = call.recording &&
                          call.recording.length > 0 &&
                          (call.recording[0].public_url || call.recording[0].src);

      if (hasRecording) callsWithRecordings++;

      // Very minimal filtering - just skip calls that are definitely in progress
      const skipDispositions = ['Call in Progress'];
      const disposition = call.status_name || call.status || '';

      if (skipDispositions.includes(disposition)) callsInProgress++;

      // Be VERY lenient - accept anything with a recording
      return hasRecording && !skipDispositions.includes(disposition);
    }).slice(0, limit);

    console.log(`[Convoso Import] Stats: ${callsWithRecordings} calls have recordings, ${callsInProgress} in progress`);
    console.log(`[Convoso Import] Found ${testCandidates.length} suitable calls for testing`);

    // Step 3: Import each call
    const imported = [];
    const failed = [];

    for (const convosoCall of testCandidates) {
      try {
        // First, check if this call already exists in our system
        // Extract recording URL EXACTLY like the working system (src/app/api/convoso/search-by-agent/route.ts:79)
        const recordingUrl = convosoCall.recording?.[0]?.public_url ||
                           convosoCall.recording?.[0]?.src || '';
        const convosoCallId = convosoCall.recording?.[0]?.recording_id || convosoCall.id;

        const existingCall = await db.oneOrNone(`
          SELECT id FROM calls
          WHERE call_id = $1
          OR (recording_url = $2 AND recording_url IS NOT NULL)
        `, [`convoso_${convosoCallId}`, recordingUrl]);

        let callId;

        if (existingCall) {
          callId = existingCall.id;
          console.log(`[Convoso Import] Call ${convosoCallId} already exists as ${callId}`);
        } else {
          // Create a new call record matching the working schema (src/lib/convoso-service.ts:550)
          const newCall = await db.one(`
            INSERT INTO calls (
              call_id,
              convoso_lead_id,
              lead_id,
              recording_url,
              duration_sec,
              agent_name,
              campaign,
              disposition,
              started_at,
              ended_at,
              created_at,
              analyzed_at,
              office_id,
              source,
              phone_number,
              metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), $11, $12, $13, $14)
            RETURNING id
          `, [
            `convoso_${convosoCallId}`,  // call_id
            convosoCall.lead_id,          // convoso_lead_id
            convosoCall.lead_id,          // lead_id
            recordingUrl,                  // recording_url
            convosoCall.call_length ? parseInt(convosoCall.call_length) : 30, // duration_sec
            convosoCall.user || 'Unknown', // agent_name
            convosoCall.campaign || 'Unknown Campaign', // campaign
            convosoCall.status_name || convosoCall.status || 'UNKNOWN', // disposition
            convosoCall.call_date || new Date().toISOString(), // started_at
            convosoCall.call_date || new Date().toISOString(), // ended_at
            1, // office_id
            'test_import', // source
            convosoCall.phone_number || '', // phone_number
            JSON.stringify({ // metadata
              imported_for_testing: true,
              test_import_date: new Date().toISOString()
            })
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
 * Determine test category based on call characteristics - using valid enum values
 */
function determineTestCategory(call: any): string {
  const duration = call.call_length ? parseInt(call.call_length) : 30;
  const disposition = call.status_name || call.status || '';

  // Map to VALID test categories from the database constraint
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