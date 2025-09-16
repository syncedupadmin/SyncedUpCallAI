import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Verify cron secret for security
function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  if (!cronSecret || !authHeader) {
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

// Smart matching algorithm for recordings
interface RecordingMatch {
  callId: string;
  confidence: 'exact' | 'fuzzy' | 'probable' | 'unmatched';
  confidenceScore: number;
  reason: string;
}

async function findBestMatch(recording: any, leadId: string): Promise<RecordingMatch | null> {
  try {
    // Normalize recording timestamps
    const recordingStartTime = new Date(recording.start_time);
    const recordingEndTime = recording.end_time ? new Date(recording.end_time) : null;
    const recordingDuration = recording.seconds || recording.duration || 0;

    console.log(`[MATCHING] Finding match for recording ${recording.recording_id}:`, {
      lead_id: leadId,
      start_time: recordingStartTime.toISOString(),
      duration: recordingDuration
    });

    // Layer 1: Try exact fingerprint match
    const fingerprintCandidates = await db.manyOrNone(`
      SELECT
        id,
        agent_name,
        started_at,
        ended_at,
        duration_sec,
        recording_fingerprint
      FROM calls
      WHERE lead_id = $1
        AND recording_url IS NULL
        AND started_at IS NOT NULL
      ORDER BY started_at DESC
    `, [leadId]);

    console.log(`[MATCHING] Found ${fingerprintCandidates.length} potential matches for lead ${leadId}`);

    for (const candidate of fingerprintCandidates) {
      const callStartTime = new Date(candidate.started_at);
      const callEndTime = candidate.ended_at ? new Date(candidate.ended_at) : null;
      const callDuration = candidate.duration_sec || 0;

      // Calculate time differences in seconds
      const startDiff = Math.abs((recordingStartTime.getTime() - callStartTime.getTime()) / 1000);
      const durationDiff = Math.abs(recordingDuration - callDuration);

      console.log(`[MATCHING] Comparing with call ${candidate.id}:`, {
        agent: candidate.agent_name,
        startDiff: startDiff,
        durationDiff: durationDiff
      });

      // Layer 1: Exact match (within 1 second)
      if (startDiff <= 1 && durationDiff <= 1) {
        return {
          callId: candidate.id,
          confidence: 'exact',
          confidenceScore: 1.0,
          reason: `Exact timestamp match (start diff: ${startDiff}s, duration diff: ${durationDiff}s)`
        };
      }

      // Layer 2: Fuzzy match (within 5 seconds)
      if (startDiff <= 5 && durationDiff <= 3) {
        return {
          callId: candidate.id,
          confidence: 'fuzzy',
          confidenceScore: 0.95,
          reason: `Fuzzy timestamp match (start diff: ${startDiff}s, duration diff: ${durationDiff}s)`
        };
      }

      // Layer 3: Probable match (within 30 seconds)
      if (startDiff <= 30 && durationDiff <= 10) {
        // Additional validation: Check if this is the only call in the time window
        const overlappingCalls = await db.one(`
          SELECT COUNT(*) as count
          FROM calls
          WHERE lead_id = $1
            AND id != $2
            AND started_at BETWEEN $3::timestamp - INTERVAL '1 minute'
                              AND $3::timestamp + INTERVAL '1 minute'
        `, [leadId, candidate.id, recordingStartTime]);

        if (overlappingCalls.count === '0') {
          return {
            callId: candidate.id,
            confidence: 'probable',
            confidenceScore: 0.8,
            reason: `Probable match - only call in time window (start diff: ${startDiff}s)`
          };
        }
      }
    }

    // No match found
    console.log(`[MATCHING] No match found for recording ${recording.recording_id}`);
    return null;

  } catch (error) {
    console.error('[MATCHING] Error finding match:', error);
    return null;
  }
}

// Store unmatched recording for manual review
async function storeUnmatchedRecording(recording: any, leadId: string, potentialMatches: any[]) {
  try {
    await db.none(`
      INSERT INTO unmatched_recordings (
        lead_id,
        recording_id,
        recording_url,
        start_time,
        end_time,
        duration_seconds,
        potential_matches,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (recording_id) DO UPDATE SET
        potential_matches = EXCLUDED.potential_matches,
        updated_at = NOW()
    `, [
      leadId,
      recording.recording_id,
      recording.url || recording.recording_url,
      recording.start_time,
      recording.end_time,
      recording.seconds || recording.duration,
      JSON.stringify(potentialMatches)
    ]);

    console.log(`[UNMATCHED] Stored unmatched recording ${recording.recording_id} for review`);
  } catch (error) {
    console.error('[UNMATCHED] Error storing unmatched recording:', error);
  }
}

// Fetch recordings from Convoso API
async function fetchConvosoRecordings(leadId: string): Promise<any[]> {
  const authToken = process.env.CONVOSO_AUTH_TOKEN;

  if (!authToken) {
    throw new Error('CONVOSO_AUTH_TOKEN not configured');
  }

  try {
    const params = new URLSearchParams({
      auth_token: authToken,
      lead_id: leadId.toString(),
      limit: '100'  // Safety limit
    });

    const url = `https://api.convoso.com/v1/leads/get-recordings?${params}`;
    console.log(`[FETCH] Getting recordings for lead ${leadId}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Convoso API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.data?.entries) {
      console.log(`[FETCH] Found ${data.data.entries.length} recordings for lead ${leadId}`);
      return data.data.entries;
    }

    return [];
  } catch (error) {
    console.error('[FETCH] Error fetching recordings:', error);
    throw error;
  }
}

// Process recordings for a specific lead
async function processLeadRecordings(leadId: string): Promise<any> {
  const results = {
    processed: 0,
    matched: 0,
    unmatched: 0,
    errors: 0,
    matches: [] as any[]
  };

  try {
    // Fetch all recordings for this lead
    const recordings = await fetchConvosoRecordings(leadId);

    for (const recording of recordings) {
      try {
        // Find the best matching call
        const match = await findBestMatch(recording, leadId);

        if (match && match.confidenceScore >= 0.8) {
          // Update the call with the recording
          await db.none(`
            UPDATE calls
            SET
              recording_url = $1,
              recording_matched_at = NOW(),
              recording_match_confidence = $2,
              metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{recording_match}',
                $3::jsonb
              ),
              updated_at = NOW()
            WHERE id = $4
          `, [
            recording.url,
            match.confidence,
            JSON.stringify({
              recording_id: recording.recording_id,
              match_reason: match.reason,
              confidence_score: match.confidenceScore,
              matched_at: new Date().toISOString()
            }),
            match.callId
          ]);

          results.matched++;
          results.matches.push({
            callId: match.callId,
            recordingId: recording.recording_id,
            confidence: match.confidence,
            reason: match.reason
          });

          console.log(`[SUCCESS] Matched recording ${recording.recording_id} to call ${match.callId} with ${match.confidence} confidence`);

        } else {
          // Store for manual review
          const potentialMatches = match ? [{
            callId: match.callId,
            confidence: match.confidence,
            score: match.confidenceScore,
            reason: match.reason
          }] : [];

          await storeUnmatchedRecording(recording, leadId, potentialMatches);
          results.unmatched++;
        }

        results.processed++;

      } catch (error: any) {
        console.error(`[ERROR] Processing recording ${recording.recording_id}:`, error);
        results.errors++;
      }
    }

  } catch (error: any) {
    console.error(`[ERROR] Processing lead ${leadId}:`, error);
    results.errors++;
  }

  return results;
}

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret for production
    if (process.env.NODE_ENV === 'production' && !verifyCronSecret(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[CRON] Starting smart recording processing');

    // Get leads that have calls without recordings
    const leadsToProcess = await db.manyOrNone(`
      SELECT DISTINCT lead_id
      FROM calls
      WHERE source = 'convoso'
        AND lead_id IS NOT NULL
        AND recording_url IS NULL
        AND started_at > NOW() - INTERVAL '7 days'
      ORDER BY lead_id
      LIMIT 20
    `);

    console.log(`[CRON] Found ${leadsToProcess.length} leads to process`);

    const overallResults = {
      leads_processed: 0,
      total_matched: 0,
      total_unmatched: 0,
      total_errors: 0,
      details: [] as any[]
    };

    // Process each lead
    for (const { lead_id } of leadsToProcess) {
      const leadResults = await processLeadRecordings(lead_id);

      overallResults.leads_processed++;
      overallResults.total_matched += leadResults.matched;
      overallResults.total_unmatched += leadResults.unmatched;
      overallResults.total_errors += leadResults.errors;

      overallResults.details.push({
        lead_id,
        ...leadResults
      });

      console.log(`[CRON] Lead ${lead_id} results:`, leadResults);
    }

    // Calculate success rate
    const totalProcessed = overallResults.total_matched + overallResults.total_unmatched;
    const successRate = totalProcessed > 0
      ? ((overallResults.total_matched / totalProcessed) * 100).toFixed(1)
      : '0';

    console.log(`[CRON] Recording processing completed. Success rate: ${successRate}%`);

    return NextResponse.json({
      ok: true,
      message: 'Smart recording processing completed',
      success_rate: `${successRate}%`,
      results: overallResults,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[CRON] Fatal error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// Allow manual trigger via GET for testing
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Method not allowed in production' },
      { status: 405 }
    );
  }

  return POST(req);
}