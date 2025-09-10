import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { parsePaginationParams, createPaginatedResponse } from '@/src/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const { limit, offset } = parsePaginationParams(searchParams);
  const category = searchParams.get('category') || 'both'; // 'best', 'worst', or 'both'
  
  try {
    if (category === 'best' || category === 'both') {
      // Get total count for best calls
      const bestCountResult = await db.query(`
        select count(*) as total
        from calls c
        join analyses an on an.call_id=c.id
        where an.qa_score >= 85
      `);
      const bestTotal = parseInt(bestCountResult.rows[0].total, 10);
      
      // Get paginated best calls
      const bestResult = await db.query(`
        select c.id, c.started_at, ag.name agent, an.qa_score, an.reason_primary, an.summary
        from calls c
        join analyses an on an.call_id=c.id
        left join agents ag on ag.id=c.agent_id
        where an.qa_score >= 85
        order by an.qa_score desc, c.started_at desc
        limit $1 offset $2
      `, [limit, offset]);
      
      if (category === 'best') {
        const response = createPaginatedResponse(bestResult.rows, bestTotal, limit, offset);
        return NextResponse.json({ category: 'best', ...response });
      }
    }
    
    if (category === 'worst' || category === 'both') {
      // Get total count for worst calls
      const worstCountResult = await db.query(`
        select count(*) as total
        from calls c
        join analyses an on an.call_id=c.id
        where (an.qa_score < 55) or (an.reason_primary in ('trust_scam_fear','bank_decline'))
      `);
      const worstTotal = parseInt(worstCountResult.rows[0].total, 10);
      
      // Get paginated worst calls
      const worstResult = await db.query(`
        select c.id, c.started_at, ag.name agent, an.qa_score, an.reason_primary, an.summary
        from calls c
        join analyses an on an.call_id=c.id
        left join agents ag on ag.id=c.agent_id
        where (an.qa_score < 55) or (an.reason_primary in ('trust_scam_fear','bank_decline'))
        order by an.qa_score asc, c.started_at desc
        limit $1 offset $2
      `, [limit, offset]);
      
      if (category === 'worst') {
        const response = createPaginatedResponse(worstResult.rows, worstTotal, limit, offset);
        return NextResponse.json({ category: 'worst', ...response });
      }
    }
    
    // Return both if category is 'both' (for backward compatibility)
    if (category === 'both') {
      // For 'both', we'll use a simpler approach with fixed limits for backward compatibility
      const best = await db.query(`
        select c.id, c.started_at, ag.name agent, an.qa_score, an.reason_primary, an.summary
        from calls c
        join analyses an on an.call_id=c.id
        left join agents ag on ag.id=c.agent_id
        where an.qa_score >= 85
        order by an.qa_score desc, c.started_at desc
        limit 20
      `);
      const worst = await db.query(`
        select c.id, c.started_at, ag.name agent, an.qa_score, an.reason_primary, an.summary
        from calls c
        join analyses an on an.call_id=c.id
        left join agents ag on ag.id=c.agent_id
        where (an.qa_score < 55) or (an.reason_primary in ('trust_scam_fear','bank_decline'))
        order by an.qa_score asc, c.started_at desc
        limit 20
      `);
      return NextResponse.json({ best: best.rows, worst: worst.rows });
    }
    
    return NextResponse.json({ error: 'Invalid category parameter' }, { status: 400 });
  } catch (err: any) {
    console.error('ui/library GET error', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
