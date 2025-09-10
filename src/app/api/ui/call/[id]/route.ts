import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    const call = await db.oneOrNone(`
      select c.*, ct.primary_phone as customer_phone
      from calls c
      left join contacts ct on ct.id = c.contact_id
      where c.id = $1
    `, [id]);

    if (!call) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    const transcript = await db.oneOrNone(`
      select call_id, text, redacted, created_at
      from transcripts
      where call_id = $1
    `, [id]);

    const analysis = await db.oneOrNone(`
      select call_id, reason_primary, reason_secondary, confidence, summary, created_at
      from analyses
      where call_id = $1
    `, [id]);

    const eventsResult = await db.query(`
      select id, type, payload, at
      from call_events
      where call_id = $1
      order by at desc
      limit 100
    `, [id]);
    const events = eventsResult.rows;

    return NextResponse.json({ ok: true, call, transcript, analysis, events });
  } catch (err: any) {
    console.error('ui/call/[id] GET error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}