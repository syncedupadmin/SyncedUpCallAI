import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get('limit') ?? 50);

    const result = await db.query(`
      with src as (
        select 
          c.id,
          c.source_ref as lead_id,
          c.contact_id,
          c.agent_id,
          c.campaign,
          c.direction,
          c.started_at,
          c.ended_at,
          c.duration_sec,
          c.disposition,
          c.recording_url,
          c.agency_id
        from calls c
        order by c.started_at desc nulls last
        limit $1
      )
      select 
        s.*,
        ct.primary_phone as customer_phone
      from src s
      left join contacts ct on ct.id = s.contact_id
      order by s.started_at desc nulls last
    `, [limit]);

    return NextResponse.json({ ok: true, rows: result.rows });
  } catch (err: any) {
    console.error('ui/calls GET error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
