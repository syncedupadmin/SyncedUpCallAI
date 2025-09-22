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
    if (!process.env.CONVOSO_API_KEY || !process.env.CONVOSO_API_SECRET) {
      return NextResponse.json(
        { error: 'Convoso API credentials not configured' },
        { status: 500 }
      );
    }

    console.log('[Convoso Import] Fetching recent calls from Convoso...');

    // Step 1: Get recent calls from Convoso
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days_back);
    const endDate = new Date();

    const convosoUrl = `https://api.convoso.com/v1/calls/search`;
    const authHeader = `Basic ${Buffer.from(`${process.env.CONVOSO_API_KEY}:${process.env.CONVOSO_API_SECRET}`).toString('base64')}`;

    const convosoResponse = await fetch(convosoUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        limit: limit * 2, // Get extra to filter
        sort: 'call_date',
        sort_order: 'desc',
        include_recordings: true
      })
    });

    if (!convosoResponse.ok) {
      const errorText = await convosoResponse.text();
      console.error('[Convoso Import] API error:', errorText);
      return NextResponse.json(
        { error: `Convoso API error: ${convosoResponse.status}` },
        { status: 502 }
      );
    }

    const convosoData = await convosoResponse.json();
    const convosoCalls = convosoData.data || convosoData.calls || [];

    if (convosoCalls.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No recent calls found in Convoso',
        imported: 0
      });
    }

    // Step 2: Filter calls suitable for testing
    const testCandidates = convosoCalls.filter((call: any) => {
      const duration = call.duration || call.talk_time || 0;
      return (
        duration >= min_duration &&
        duration <= max_duration &&
        call.recording_url &&
        (call.disposition !== 'No Answer' && call.disposition !== 'Busy')
      );
    }).slice(0, limit);

    console.log(`[Convoso Import] Found ${testCandidates.length} suitable calls for testing`);

    // Step 3: Import each call
    const imported = [];
    const failed = [];

    for (const convosoCall of testCandidates) {
      try {
        // First, check if this call already exists in our system
        const existingCall = await db.oneOrNone(`
          SELECT id FROM calls
          WHERE convoso_call_id = $1
          OR (recording_url = $2 AND recording_url IS NOT NULL)
        `, [convosoCall.call_id, convosoCall.recording_url]);

        let callId;

        if (existingCall) {
          callId = existingCall.id;
          console.log(`[Convoso Import] Call ${convosoCall.call_id} already exists as ${callId}`);
        } else {
          // Create a new call record
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
            convosoCall.call_id,
            convosoCall.recording_url,
            convosoCall.duration || convosoCall.talk_time,
            convosoCall.agent_name || convosoCall.agent,
            convosoCall.campaign || convosoCall.queue,
            convosoCall.disposition,
            'outbound',
            convosoCall.call_date || convosoCall.start_time || new Date().toISOString()
          ]);
          callId = newCall.id;
          console.log(`[Convoso Import] Created new call ${callId} from Convoso ${convosoCall.call_id}`);

          // Trigger transcription
          await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/jobs/transcribe`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.JOBS_SECRET}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              callId: callId,
              recordingUrl: convosoCall.recording_url
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
          `Convoso Call - ${convosoCall.agent_name || 'Unknown'} - ${convosoCall.disposition}`,
          convosoCall.recording_url,
          convosoCall.duration || convosoCall.talk_time,
          determineTestCategory(convosoCall),
          JSON.stringify({
            convoso_call_id: convosoCall.call_id,
            agent: convosoCall.agent_name,
            campaign: convosoCall.campaign,
            disposition: convosoCall.disposition,
            phone: convosoCall.phone_number,
            imported_from: 'convoso_direct'
          }),
          3, // Medium difficulty by default
          'convoso_import',
          callId
        ]);

        imported.push({
          test_case_id: testCase.id,
          call_id: callId,
          convoso_id: convosoCall.call_id,
          agent: convosoCall.agent_name,
          duration: convosoCall.duration
        });

      } catch (error: any) {
        console.error(`[Convoso Import] Failed to import call ${convosoCall.call_id}:`, error);
        failed.push({
          convoso_id: convosoCall.call_id,
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
    const hasCredentials = !!(process.env.CONVOSO_API_KEY && process.env.CONVOSO_API_SECRET);

    if (!hasCredentials) {
      return NextResponse.json({
        connected: false,
        message: 'Convoso API credentials not configured',
        setup_instructions: [
          '1. Add CONVOSO_API_KEY to your .env.local',
          '2. Add CONVOSO_API_SECRET to your .env.local',
          '3. Restart the development server'
        ]
      });
    }

    // Test the connection
    const authHeader = `Basic ${Buffer.from(`${process.env.CONVOSO_API_KEY}:${process.env.CONVOSO_API_SECRET}`).toString('base64')}`;

    const testResponse = await fetch('https://api.convoso.com/v1/account', {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    if (testResponse.ok) {
      const accountData = await testResponse.json();
      return NextResponse.json({
        connected: true,
        message: 'Convoso API connected successfully',
        account: accountData.account_name || 'Unknown'
      });
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
  const duration = call.duration || call.talk_time || 0;

  if (duration < 15) return 'rejection_immediate';
  if (duration < 30) return 'short_call';
  if (duration > 180) return 'long_conversation';

  if (call.disposition === 'Sale' || call.disposition === 'SOLD') return 'successful_sale';
  if (call.disposition === 'Callback') return 'callback_scheduled';
  if (call.disposition === 'Not Interested') return 'rejection_handled';

  return 'multiple_speakers'; // Default category
}