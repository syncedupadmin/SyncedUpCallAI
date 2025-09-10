import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { checkRateLimit } from '@/src/server/middleware/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Rate limiting
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  // Check authorization
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.JOBS_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    // Scan for eligible calls
    const { rows: eligible } = await db.query(`
      WITH call_stats AS (
        SELECT 
          COUNT(*) FILTER (WHERE c.duration_sec >= 10 AND c.recording_url IS NOT NULL) as eligible_count,
          COUNT(*) FILTER (WHERE t.call_id IS NOT NULL) as transcribed_count,
          COUNT(*) FILTER (WHERE a.call_id IS NOT NULL) as analyzed_count
        FROM calls c
        LEFT JOIN transcripts t ON t.call_id = c.id
        LEFT JOIN analyses a ON a.call_id = c.id
        WHERE c.started_at > now() - interval '2 days'
      ),
      pending_calls AS (
        SELECT c.id
        FROM calls c
        LEFT JOIN transcripts t ON t.call_id = c.id
        WHERE c.started_at > now() - interval '2 days'
          AND c.duration_sec >= 10
          AND c.recording_url IS NOT NULL
          AND t.call_id IS NULL
        LIMIT 10
      )
      SELECT 
        (SELECT eligible_count FROM call_stats) as total_eligible,
        (SELECT transcribed_count FROM call_stats) as transcribed,
        (SELECT analyzed_count FROM call_stats) as analyzed,
        (SELECT COUNT(*) FROM pending_calls) as pending_count,
        ARRAY(SELECT id FROM pending_calls) as pending_ids
    `);

    const stats = eligible[0] || {
      total_eligible: 0,
      transcribed: 0,
      analyzed: 0,
      pending_count: 0,
      pending_ids: []
    };

    // Calculate counts
    const scanned = parseInt(stats.total_eligible) || 0;
    const completed = parseInt(stats.transcribed) || 0;
    const posted = parseInt(stats.pending_count) || 0;
    const remaining = scanned - completed;

    // Log scan event
    await db.none(`
      INSERT INTO call_events(call_id, type, payload)
      VALUES('SYSTEM', 'batch_scan', $1)
    `, [{
      scanned,
      completed,
      posted,
      remaining,
      timestamp: new Date().toISOString()
    }]);

    return NextResponse.json({
      ok: true,
      scanned,
      posted,
      completed,
      remaining,
      stats: {
        total_eligible: scanned,
        transcribed: completed,
        analyzed: parseInt(stats.analyzed) || 0,
        pending: posted,
        pending_ids: stats.pending_ids
      }
    });
  } catch (error: any) {
    console.error('Batch scan error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const rateLimitResponse = checkRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  // Check authorization
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.JOBS_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    // Trigger actual batch processing
    const response = await fetch(`${process.env.APP_URL}/api/jobs/batch`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.JOBS_SECRET}`
      }
    });

    if (!response.ok) {
      throw new Error(`Batch trigger failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return NextResponse.json({
      ok: true,
      triggered: true,
      ...data
    });
  } catch (error: any) {
    console.error('Batch trigger error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 });
  }
}