import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// Test endpoint to fetch and match recordings with smart algorithm
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const {
      lead_id,
      user_email,
      limit = 10,
      dry_run = false,
      test_matching = true  // New flag to test matching algorithm
    } = body;

    if (!lead_id && !user_email) {
      return NextResponse.json({
        ok: false,
        error: 'Either lead_id or user_email is required'
      }, { status: 400 });
    }

    const authToken = process.env.CONVOSO_AUTH_TOKEN;
    if (!authToken) {
      return NextResponse.json({
        ok: false,
        error: 'CONVOSO_AUTH_TOKEN not configured'
      }, { status: 500 });
    }

    console.log('[SMART TEST] Starting with:', { lead_id, user_email, limit, dry_run, test_matching });

    // Fetch recordings from Convoso
    let recordings = [];
    if (lead_id) {
      const params = new URLSearchParams({
        auth_token: authToken,
        lead_id: lead_id.toString(),
        limit: Math.min(limit, 10).toString()  // Max 10 for safety
      });

      const url = `https://api.convoso.com/v1/leads/get-recordings?${params}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.entries) {
          recordings = data.data.entries;
        }
      }
    }

    console.log(`[SMART TEST] Found ${recordings.length} recordings`);

    // Get existing calls for this lead from database
    const existingCalls = lead_id ? await db.manyOrNone(`
      SELECT
        id,
        agent_name,
        agent_email,
        started_at,
        ended_at,
        duration_sec,
        recording_url,
        recording_fingerprint,
        recording_match_confidence
      FROM calls
      WHERE lead_id = $1
        AND source = 'convoso'
      ORDER BY started_at DESC
    `, [lead_id]) : [];

    console.log(`[SMART TEST] Found ${existingCalls.length} existing calls in database`);

    // Test matching algorithm
    const matchResults = [];

    if (test_matching && recordings.length > 0) {
      for (const recording of recordings) {
        const recordingStart = new Date(recording.start_time);
        const recordingDuration = recording.seconds || 0;

        let bestMatch = null;
        let bestConfidence = 0;
        let matchReason = '';

        // Try to match with existing calls
        for (const call of existingCalls) {
          if (call.recording_url) continue; // Skip already matched calls

          const callStart = new Date(call.started_at);
          const callDuration = call.duration_sec || 0;

          // Calculate differences
          const startDiff = Math.abs((recordingStart.getTime() - callStart.getTime()) / 1000);
          const durationDiff = Math.abs(recordingDuration - callDuration);

          // Determine confidence level
          if (startDiff <= 1 && durationDiff <= 1) {
            // Exact match
            bestMatch = call;
            bestConfidence = 1.0;
            matchReason = `EXACT: Start diff ${startDiff}s, duration diff ${durationDiff}s`;
            break; // Perfect match found
          } else if (startDiff <= 5 && durationDiff <= 3 && bestConfidence < 0.95) {
            // Fuzzy match
            bestMatch = call;
            bestConfidence = 0.95;
            matchReason = `FUZZY: Start diff ${startDiff}s, duration diff ${durationDiff}s`;
          } else if (startDiff <= 30 && durationDiff <= 10 && bestConfidence < 0.8) {
            // Probable match
            bestMatch = call;
            bestConfidence = 0.8;
            matchReason = `PROBABLE: Start diff ${startDiff}s, duration diff ${durationDiff}s`;
          }
        }

        matchResults.push({
          recording_id: recording.recording_id,
          recording_url: recording.url,
          start_time: recording.start_time,
          duration: recordingDuration,
          matched: !!bestMatch,
          match_details: bestMatch ? {
            call_id: bestMatch.id,
            agent: bestMatch.agent_name,
            confidence: bestConfidence,
            reason: matchReason,
            would_update: !dry_run
          } : {
            reason: 'No matching call found',
            would_go_to_review: true
          }
        });

        // Actually update the database if not dry run
        if (!dry_run && bestMatch && bestConfidence >= 0.8) {
          await db.none(`
            UPDATE calls
            SET
              recording_url = $1,
              recording_matched_at = NOW(),
              recording_match_confidence = $2,
              metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{test_match}',
                $3::jsonb
              ),
              updated_at = NOW()
            WHERE id = $4
          `, [
            recording.url,
            bestConfidence === 1.0 ? 'exact' : bestConfidence === 0.95 ? 'fuzzy' : 'probable',
            JSON.stringify({
              recording_id: recording.recording_id,
              match_reason: matchReason,
              confidence_score: bestConfidence,
              matched_at: new Date().toISOString(),
              test_run: true
            }),
            bestMatch.id
          ]);

          console.log(`[SMART TEST] Updated call ${bestMatch.id} with recording ${recording.recording_id}`);
        }
      }
    }

    // Calculate statistics
    const stats = {
      exact_matches: matchResults.filter(m => m.match_details?.confidence === 1.0).length,
      fuzzy_matches: matchResults.filter(m => m.match_details?.confidence === 0.95).length,
      probable_matches: matchResults.filter(m => m.match_details?.confidence === 0.8).length,
      unmatched: matchResults.filter(m => !m.matched).length,
      success_rate: matchResults.length > 0
        ? ((matchResults.filter(m => m.matched).length / matchResults.length) * 100).toFixed(1) + '%'
        : '0%'
    };

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      ok: true,
      message: dry_run ? 'Test completed (no changes made)' : 'Recordings processed with smart matching',
      lead_id,
      recordings_found: recordings.length,
      calls_in_database: existingCalls.length,
      dry_run,
      match_results: matchResults,
      statistics: stats,
      execution_time_ms: elapsed,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[SMART TEST] Error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

// GET endpoint for status and instructions
export async function GET(req: NextRequest) {
  try {
    // Get recent matches
    const recentMatches = await db.manyOrNone(`
      SELECT
        id,
        lead_id,
        agent_name,
        recording_url,
        recording_match_confidence,
        recording_matched_at
      FROM calls
      WHERE source = 'convoso'
        AND recording_match_confidence IS NOT NULL
      ORDER BY recording_matched_at DESC NULLS LAST
      LIMIT 10
    `);

    // Get unmatched recordings count
    const unmatchedCount = await db.oneOrNone(`
      SELECT COUNT(*) as count
      FROM unmatched_recordings
      WHERE reviewed = FALSE
    `);

    // Get match statistics
    const matchStats = await db.oneOrNone(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN recording_match_confidence = 'exact' THEN 1 END) as exact_matches,
        COUNT(CASE WHEN recording_match_confidence = 'fuzzy' THEN 1 END) as fuzzy_matches,
        COUNT(CASE WHEN recording_match_confidence = 'probable' THEN 1 END) as probable_matches,
        COUNT(CASE WHEN recording_match_confidence = 'manual' THEN 1 END) as manual_matches
      FROM calls
      WHERE source = 'convoso'
        AND recording_match_confidence IS NOT NULL
    `);

    return NextResponse.json({
      ok: true,
      message: 'Smart Recording Matching Test Endpoint',
      status: {
        recent_matches: recentMatches.length,
        unmatched_pending_review: parseInt(unmatchedCount?.count || '0'),
        match_statistics: {
          total: parseInt(matchStats?.total || '0'),
          exact: parseInt(matchStats?.exact_matches || '0'),
          fuzzy: parseInt(matchStats?.fuzzy_matches || '0'),
          probable: parseInt(matchStats?.probable_matches || '0'),
          manual: parseInt(matchStats?.manual_matches || '0')
        },
        recent_match_samples: recentMatches.map(m => ({
          lead_id: m.lead_id,
          agent: m.agent_name,
          confidence: m.recording_match_confidence,
          matched_at: m.recording_matched_at
        }))
      },
      instructions: {
        endpoint: 'POST /api/test/smart-recording-test',
        body: {
          lead_id: 'Lead ID from Convoso (required)',
          limit: 'Max 10 recordings',
          dry_run: 'Test without saving (default: false)',
          test_matching: 'Test matching algorithm (default: true)'
        },
        examples: [
          {
            description: 'Test with dry run',
            body: { lead_id: '12345', limit: 5, dry_run: true }
          },
          {
            description: 'Actually update database',
            body: { lead_id: '12345', limit: 10, dry_run: false }
          }
        ]
      }
    });

  } catch (error: any) {
    console.error('[SMART TEST] Status error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}