import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('lead_id');

    if (!leadId) {
      return NextResponse.json({
        ok: false,
        error: 'lead_id is required'
      }, { status: 400 });
    }

    // Get calls for this lead that don't have recordings
    const calls = await db.manyOrNone(`
      SELECT
        id,
        agent_name,
        agent_email,
        started_at,
        ended_at,
        duration_sec,
        disposition,
        lead_id,
        recording_url
      FROM calls
      WHERE lead_id = $1
        AND source = 'convoso'
        AND recording_url IS NULL
      ORDER BY started_at DESC
    `, [leadId]);

    return NextResponse.json({
      ok: true,
      calls,
      lead_id: leadId
    });

  } catch (error: any) {
    console.error('Error fetching calls for lead:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}