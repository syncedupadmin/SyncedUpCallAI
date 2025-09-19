import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const batchId = req.nextUrl.searchParams.get('batch_id');

  if (!batchId) {
    return NextResponse.json({
      ok: false,
      error: 'batch_id required'
    }, { status: 400 });
  }

  try {
    // Get batch progress from database
    const result = await db.query(`
      SELECT batch_id, total, scanned, posted, completed, failed, status
      FROM batch_progress
      WHERE batch_id = $1
    `, [batchId]);

    if (result.rows.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'batch_not_found'
      }, { status: 404 });
    }

    const progress = result.rows[0];

    return NextResponse.json({
      ok: true,
      batch_id: batchId,
      progress: {
        total: progress.total,
        scanned: progress.scanned,
        posted: progress.posted,
        completed: progress.completed,
        failed: progress.failed
      },
      status: progress.status
    });
  } catch (error: any) {
    console.error('Error fetching batch progress:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}