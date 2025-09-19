import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // No auth check - this is for diagnostics
    console.log('Starting calls diagnostic...');

    // 1. Check if we can connect to the database
    const dbCheck = await db.oneOrNone('SELECT 1 as connected');

    // 2. Count total calls
    const countResult = await db.oneOrNone('SELECT COUNT(*) as total FROM calls');

    // 3. Get sample of recent calls
    const recentCalls = await db.manyOrNone(`
      SELECT
        id,
        source,
        campaign,
        disposition,
        started_at,
        created_at,
        office_id
      FROM calls
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // 4. Check for calls with different sources
    const sourceBreakdown = await db.manyOrNone(`
      SELECT
        source,
        COUNT(*) as count
      FROM calls
      GROUP BY source
      ORDER BY count DESC
    `);

    // 5. Check for recent calls (last 24 hours)
    const recentCount = await db.oneOrNone(`
      SELECT COUNT(*) as recent
      FROM calls
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    // 6. Check office_id distribution
    const officeBreakdown = await db.manyOrNone(`
      SELECT
        office_id,
        COUNT(*) as count
      FROM calls
      GROUP BY office_id
      ORDER BY count DESC
    `);

    return NextResponse.json({
      ok: true,
      diagnostic: {
        database_connected: !!dbCheck,
        total_calls: parseInt(countResult?.total || '0'),
        recent_calls_24h: parseInt(recentCount?.recent || '0'),
        sample_calls: recentCalls,
        source_breakdown: sourceBreakdown,
        office_breakdown: officeBreakdown,
        database_url_present: !!process.env.DATABASE_URL,
        database_url_type: process.env.DATABASE_URL?.includes('supabase') ? 'supabase' : 'other'
      }
    });
  } catch (error: any) {
    console.error('Diagnostic error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: error.stack,
      code: error.code
    });
  }
}