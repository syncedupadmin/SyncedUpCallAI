import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const best = await db.query(`
    select c.id, c.started_at, ag.name agent, an.qa_score, an.reason_primary, an.summary
    from calls c
    join analyses an on an.call_id=c.id
    left join agents ag on ag.id=c.agent_id
    where an.qa_score >= 85
    order by an.qa_score desc, c.started_at desc
    limit 50
  `);
  const worst = await db.query(`
    select c.id, c.started_at, ag.name agent, an.qa_score, an.reason_primary, an.summary
    from calls c
    join analyses an on an.call_id=c.id
    left join agents ag on ag.id=c.agent_id
    where (an.qa_score < 55) or (an.reason_primary in ('trust_scam_fear','bank_decline'))
    order by an.qa_score asc, c.started_at desc
    limit 50
  `);
  return NextResponse.json({ best: best.rows, worst: worst.rows });
}
