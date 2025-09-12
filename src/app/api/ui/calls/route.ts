import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { parsePaginationParams, createPaginatedResponse } from '@/src/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { limit, offset } = parsePaginationParams(searchParams);

    // Check database health first with short timeout
    const isHealthy = await db.healthCheck(2000).catch(() => false);
    
    if (!isHealthy) {
      console.log('Database is unhealthy, returning empty response');
      const response = createPaginatedResponse([], 0, limit, offset);
      return NextResponse.json({ 
        ok: true, 
        ...response,
        warning: 'Database temporarily unavailable' 
      });
    }

    // Get total count
    const countResult = await db.query(`
      select count(*) as total
      from calls c
    `);
    const total = parseInt(countResult.rows[0]?.total || 0, 10);

    // Get paginated data
    const result = await db.query(`
      with src as (
        select
          c.id,
          c.started_at,
          c.duration_sec,
          c.disposition,
          c.recording_url,
          c.contact_id,
          c.agent_id,
          c.agency_id,
          c.source_ref as lead_id,
          c.campaign,
          c.direction,
          c.ended_at
        from calls c
        order by c.started_at desc nulls last
        limit $1 offset $2
      )
      select
        s.*,
        ct.primary_phone as customer_phone,
        ag.name as agent,
        an.reason_primary,
        an.summary,
        vf.has_policy_300_plus
      from src s
      left join contacts ct on ct.id = s.contact_id
      left join agents ag on ag.id = s.agent_id
      left join analyses an on an.call_id = s.id
      left join call_value_flags vf on vf.call_id = s.id
      order by s.started_at desc nulls last
    `, [limit, offset]);

    const response = createPaginatedResponse(result.rows, total, limit, offset);
    return NextResponse.json({ ok: true, ...response });
  } catch (err: any) {
    console.error('ui/calls GET error:', err.message);
    
    // Return empty data gracefully instead of 500 error
    const { searchParams } = new URL(req.url);
    const { limit, offset } = parsePaginationParams(searchParams);
    const response = createPaginatedResponse([], 0, limit, offset);
    
    return NextResponse.json({ 
      ok: true, 
      ...response,
      warning: 'Unable to fetch calls at this time'
    });
  }
}
