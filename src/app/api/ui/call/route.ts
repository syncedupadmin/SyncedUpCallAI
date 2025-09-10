import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  
  if (!id) {
    return NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 });
  }

  try {
    // Get call details
    const call = await db.oneOrNone(`
      SELECT 
        c.*,
        CASE WHEN p.premium >= 300 THEN true ELSE false END as has_policy_300_plus
      FROM calls c
      LEFT JOIN policies_stub p ON p.customer_phone = c.customer_phone
      WHERE c.id = $1
    `, [id]);

    if (!call) {
      return NextResponse.json({ ok: false, error: 'call_not_found' }, { status: 404 });
    }

    // Get transcript
    const transcript = await db.oneOrNone(`
      SELECT * FROM transcripts WHERE call_id = $1
    `, [id]);

    // Get analysis
    const analysis = await db.oneOrNone(`
      SELECT * FROM analyses WHERE call_id = $1
    `, [id]);

    // Get contact info if available
    const contact = await db.oneOrNone(`
      SELECT * FROM policies_stub WHERE customer_phone = $1
    `, [call.customer_phone]);

    // Get last 50 events
    const events = await db.manyOrNone(`
      SELECT id, type, payload, created_at as at
      FROM call_events
      WHERE call_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [id]);

    return NextResponse.json({
      ok: true,
      call,
      transcript,
      analysis,
      contact,
      events: events.reverse() // Chronological order
    });
  } catch (error: any) {
    console.error('Error fetching call details:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 });
  }
}