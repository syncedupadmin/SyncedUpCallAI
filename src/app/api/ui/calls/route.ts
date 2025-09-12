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

    // Get paginated data - using only columns that exist in your database
    const result = await db.query(`
      select
        c.id,
        c.started_at,
        c.duration_sec,
        c.disposition,
        c.recording_url,
        c.contact_id,
        c.agent_id,
        c.agency_id,
        c.lead_id,
        c.campaign,
        c.direction,
        c.ended_at,
        c.agent_name as agent,
        c.agent_email,
        c.source,
        c.source_ref,
        c.metadata,
        c.sale_time,
        ag.name as agent_from_table
      from calls c
      left join agents ag on ag.id = c.agent_id
      order by c.started_at desc nulls last
      limit $1 offset $2
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
