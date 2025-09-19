import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated, unauthorizedResponse } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Get unprocessed calls
async function getUnprocessedCalls(limit: number = 100) {
  return await db.manyOrNone(`
    SELECT
      c.id,
      c.call_id,
      c.lead_id,
      c.agent_name,
      c.duration,
      c.recording_url,
      c.created_at,
      CASE
        WHEN t.call_id IS NOT NULL THEN 'transcribed'
        WHEN a.call_id IS NOT NULL THEN 'analyzed'
        WHEN c.recording_url IS NOT NULL THEN 'ready'
        ELSE 'pending_recording'
      END as status
    FROM calls c
    LEFT JOIN transcripts t ON t.call_id = c.id
    LEFT JOIN analyses a ON a.call_id = c.id
    WHERE c.duration >= 10
      AND t.call_id IS NULL
      AND c.created_at > NOW() - INTERVAL '30 days'
    ORDER BY c.created_at DESC
    LIMIT $1
  `, [limit]);
}

// Process a single call
async function processCall(callId: string): Promise<any> {
  try {
    // Trigger transcription (which also triggers analysis)
    const response = await fetch(`${process.env.APP_URL}/api/jobs/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.JOBS_SECRET}`
      },
      body: JSON.stringify({ callId })
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        call_id: callId,
        success: false,
        error: error || response.statusText
      };
    }

    const result = await response.json();
    return {
      call_id: callId,
      success: true,
      ...result
    };
  } catch (error: any) {
    return {
      call_id: callId,
      success: false,
      error: error.message
    };
  }
}

// GET: List unprocessed calls
export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return unauthorizedResponse();
  }

  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');

    const calls = await getUnprocessedCalls(limit);

    // Get statistics
    const stats = await db.oneOrNone(`
      SELECT
        COUNT(*) FILTER (WHERE duration >= 10) as total_eligible,
        COUNT(*) FILTER (WHERE duration >= 10 AND recording_url IS NOT NULL) as has_recording,
        COUNT(*) FILTER (WHERE t.call_id IS NOT NULL) as transcribed,
        COUNT(*) FILTER (WHERE a.call_id IS NOT NULL) as analyzed,
        COUNT(*) FILTER (WHERE duration >= 10 AND t.call_id IS NULL) as pending_transcription,
        COUNT(*) FILTER (WHERE duration >= 10 AND recording_url IS NULL) as pending_recording
      FROM calls c
      LEFT JOIN transcripts t ON t.call_id = c.id
      LEFT JOIN analyses a ON a.call_id = c.id
      WHERE c.created_at > NOW() - INTERVAL '30 days'
    `);

    return NextResponse.json({
      ok: true,
      stats,
      calls,
      count: calls.length
    });
  } catch (error: any) {
    console.error('Error fetching unprocessed calls:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// POST: Process calls in batch
export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return unauthorizedResponse();
  }

  try {
    const body = await req.json();
    const {
      call_ids,
      auto_detect = false,
      limit = 10,
      delay_ms = 500
    } = body;

    let callsToProcess: string[] = [];

    if (call_ids && Array.isArray(call_ids)) {
      // Use provided call IDs
      callsToProcess = call_ids;
    } else if (auto_detect) {
      // Auto-detect calls that need processing
      const unprocessed = await getUnprocessedCalls(limit);
      callsToProcess = unprocessed
        .filter(c => c.status === 'ready' && c.recording_url)
        .map(c => c.id);
    } else {
      return NextResponse.json({
        ok: false,
        error: 'Provide call_ids array or set auto_detect to true'
      }, { status: 400 });
    }

    if (callsToProcess.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No calls to process',
        results: []
      });
    }

    // Process calls with rate limiting
    const results = [];
    for (const callId of callsToProcess) {
      const result = await processCall(callId);
      results.push(result);

      // Rate limit between calls
      if (delay_ms > 0 && callsToProcess.indexOf(callId) < callsToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay_ms));
      }
    }

    // Calculate summary
    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      errors: results.filter(r => !r.success).map(r => ({
        call_id: r.call_id,
        error: r.error
      }))
    };

    return NextResponse.json({
      ok: true,
      summary,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Batch processing error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// PUT: Queue calls for recording fetch
export async function PUT(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return unauthorizedResponse();
  }

  try {
    // Find calls without recordings that aren't already queued
    const result = await db.manyOrNone(`
      INSERT INTO pending_recordings (call_id, lead_id, attempts, created_at)
      SELECT
        c.id,
        c.lead_id,
        0,
        NOW()
      FROM calls c
      LEFT JOIN pending_recordings pr ON pr.call_id = c.id
      LEFT JOIN transcripts t ON t.call_id = c.id
      WHERE c.recording_url IS NULL
        AND c.lead_id IS NOT NULL
        AND c.duration >= 10
        AND pr.id IS NULL
        AND t.call_id IS NULL
        AND c.created_at > NOW() - INTERVAL '7 days'
      LIMIT 100
      RETURNING call_id, lead_id
    `);

    return NextResponse.json({
      ok: true,
      message: `Queued ${result.length} calls for recording fetch`,
      queued: result.length,
      calls: result
    });
  } catch (error: any) {
    console.error('Error queuing recordings:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}