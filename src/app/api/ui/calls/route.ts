import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { rows } = await db.query(`
    select c.id, c.started_at, c.duration_sec, c.disposition, c.recording_url,
           ct.primary_phone, ag.name as agent, an.reason_primary, an.summary
    from calls c
    left join contacts ct on ct.id=c.contact_id
    left join agents ag on ag.id=c.agent_id
    left join analyses an on an.call_id=c.id
    order by c.started_at desc
    limit 500
  `);
  return NextResponse.json({ rows });
}
