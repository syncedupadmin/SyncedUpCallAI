import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Get unmatched recordings that haven't been reviewed
    const recordings = await db.manyOrNone(`
      SELECT
        id,
        lead_id,
        recording_id,
        recording_url,
        start_time,
        end_time,
        duration_seconds,
        potential_matches,
        created_at
      FROM unmatched_recordings
      WHERE reviewed = FALSE
      ORDER BY created_at DESC
      LIMIT 50
    `);

    // Get summary stats
    const stats = await db.one(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN reviewed = TRUE THEN 1 END) as reviewed,
        COUNT(CASE WHEN reviewed = FALSE THEN 1 END) as pending
      FROM unmatched_recordings
    `);

    return NextResponse.json({
      ok: true,
      recordings,
      stats: {
        total: parseInt(stats.total),
        reviewed: parseInt(stats.reviewed),
        pending: parseInt(stats.pending)
      }
    });

  } catch (error: any) {
    console.error('Error fetching unmatched recordings:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}