import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Admin endpoint to manually fetch recordings for specific users
export async function POST(req: NextRequest) {
  try {
    // Check admin authorization
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        ok: false,
        error: 'Not authenticated'
      }, { status: 401 });
    }

    // Check if user is admin
    const { data: isAdmin } = await supabase.rpc('is_super_admin');
    if (!isAdmin) {
      return NextResponse.json({
        ok: false,
        error: 'Admin access required'
      }, { status: 403 });
    }

    // Parse request body
    const body = await req.json();
    const {
      user_email,
      limit = 10, // Default to 10 for admin interface
      save_to_db = true // Allow preview without saving
    } = body;

    // Validate inputs
    if (!user_email) {
      return NextResponse.json({
        ok: false,
        error: 'user_email is required'
      }, { status: 400 });
    }

    // Enforce maximum limit of 100
    const recordLimit = Math.min(limit, 100);

    console.log('[ADMIN FETCH RECORDINGS] Starting fetch:', {
      admin_user: user.email,
      target_user: user_email,
      limit: recordLimit,
      save_to_db,
      timestamp: new Date().toISOString()
    });

    // Get Convoso auth token
    const authToken = process.env.CONVOSO_AUTH_TOKEN;
    if (!authToken) {
      return NextResponse.json({
        ok: false,
        error: 'Convoso integration not configured'
      }, { status: 500 });
    }

    // Call Convoso API (using correct domain)
    const convosoUrl = 'https://api.convoso.com/v1/users/get-recordings';
    const requestBody = {
      auth_token: authToken,
      user: user_email
    };

    const response = await fetch(convosoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        ok: false,
        error: `Convoso API error: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    const data = await response.json();
    const recordings = Array.isArray(data) ? data :
                      (data.recordings || data.data || []);

    // Limit recordings
    const limitedRecordings = recordings.slice(0, recordLimit);

    // Process recordings
    const results = {
      total_found: recordings.length,
      processed: limitedRecordings.length,
      saved: 0,
      updated: 0,
      recordings: [] as any[]
    };

    for (const recording of limitedRecordings) {
      const recordingInfo = {
        lead_id: recording.lead_id || recording.LeadID,
        recording_url: recording.recording_url || recording.RecordingURL || recording.url,
        agent: recording.agent_name || recording.AgentName || user_email,
        duration: recording.duration || recording.Duration,
        date: recording.date || recording.Date || recording.start_time,
        disposition: recording.disposition || recording.Disposition
      };

      results.recordings.push(recordingInfo);

      // Save to database if requested
      if (save_to_db && recordingInfo.recording_url && recordingInfo.lead_id) {
        try {
          // Check if call exists using source_ref
          const existingCall = await db.oneOrNone(`
            SELECT id, recording_url
            FROM calls
            WHERE source_ref = $1
            LIMIT 1
          `, [recordingInfo.lead_id]);

          if (existingCall && !existingCall.recording_url) {
            // Update existing call
            await db.none(`
              UPDATE calls
              SET
                recording_url = $2,
                updated_at = NOW()
              WHERE id = $1
            `, [existingCall.id, recordingInfo.recording_url]);

            results.updated++;
          } else if (!existingCall) {
            // Create new call record using source_ref
            await db.none(`
              INSERT INTO calls (
                id,
                source,
                source_ref,
                recording_url,
                agent_name,
                disposition,
                created_at
              ) VALUES (
                gen_random_uuid(),
                'convoso',
                $1,
                $2,
                $3,
                $4,
                NOW()
              )
              ON CONFLICT (source_ref) DO UPDATE
              SET
                recording_url = EXCLUDED.recording_url,
                updated_at = NOW()
            `, [
              recordingInfo.lead_id,
              recordingInfo.recording_url,
              recordingInfo.agent,
              recordingInfo.disposition
            ]);

            results.saved++;
          }

          // Clear from pending_recordings
          await db.none(`
            UPDATE pending_recordings
            SET
              processed = true,
              processed_at = NOW()
            WHERE lead_id = $1 AND processed = false
          `, [recordingInfo.lead_id]);

        } catch (dbError: any) {
          console.error('[ADMIN FETCH RECORDINGS] DB error:', dbError);
        }
      }
    }

    // Log admin action
    console.log('[ADMIN FETCH RECORDINGS] Completed:', {
      admin_user: user.email,
      target_user: user_email,
      results
    });

    return NextResponse.json({
      ok: true,
      message: save_to_db ? 'Recordings fetched and saved' : 'Recordings fetched (preview only)',
      user_email,
      limit: recordLimit,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[ADMIN FETCH RECORDINGS] Error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// GET endpoint to check recording status
export async function GET(req: NextRequest) {
  try {
    // Check admin authorization
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        ok: false,
        error: 'Not authenticated'
      }, { status: 401 });
    }

    const { data: isAdmin } = await supabase.rpc('is_super_admin');
    if (!isAdmin) {
      return NextResponse.json({
        ok: false,
        error: 'Admin access required'
      }, { status: 403 });
    }

    // Get statistics
    const stats = await db.one(`
      SELECT
        COUNT(*) FILTER (WHERE recording_url IS NOT NULL) as with_recordings,
        COUNT(*) FILTER (WHERE recording_url IS NULL) as without_recordings,
        COUNT(DISTINCT agent_name) as unique_agents,
        MAX(updated_at) as last_update
      FROM calls
      WHERE source = 'convoso'
    `);

    // Get pending recordings
    const pending = await db.one(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE processed = false) as unprocessed,
        COUNT(*) FILTER (WHERE processed = true AND error_message IS NOT NULL) as failed
      FROM pending_recordings
    `);

    // Get recent recordings
    const recentRecordings = await db.manyOrNone(`
      SELECT
        id,
        lead_id,
        recording_url,
        agent_name,
        disposition,
        updated_at
      FROM calls
      WHERE
        source = 'convoso'
        AND recording_url IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 5
    `);

    return NextResponse.json({
      ok: true,
      stats: {
        calls_with_recordings: parseInt(stats.with_recordings),
        calls_without_recordings: parseInt(stats.without_recordings),
        unique_agents: parseInt(stats.unique_agents),
        last_update: stats.last_update
      },
      pending_recordings: {
        total: parseInt(pending.total),
        unprocessed: parseInt(pending.unprocessed),
        failed: parseInt(pending.failed)
      },
      recent_recordings: recentRecordings,
      instructions: {
        endpoint: 'POST /api/admin/fetch-recordings',
        required: { user_email: 'Agent email address' },
        optional: {
          limit: 'Number of recordings (max 100)',
          save_to_db: 'Whether to save to database (default true)'
        }
      }
    });

  } catch (error: any) {
    console.error('[ADMIN FETCH RECORDINGS] Status error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}