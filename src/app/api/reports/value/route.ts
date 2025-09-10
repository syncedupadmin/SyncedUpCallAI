import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Use stub: high-value = premium >= 300
  const { rows } = await db.query(`
    select a.reason_primary,
           count(*) as calls,
           sum(case when p.premium >= 300 then p.premium else 0 end) as lost_value
    from analyses a
    join calls c on c.id=a.call_id
    left join policies_stub p on p.contact_id=c.contact_id and p.status in ('cancelled','refunded','chargeback')
    where c.started_at > now() - interval '30 days'
    group by 1
    order by lost_value desc nulls last, calls desc
  `);
  return NextResponse.json({ rows });
}
