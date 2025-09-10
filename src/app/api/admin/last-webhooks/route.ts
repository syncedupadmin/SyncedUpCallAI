import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { parsePaginationParams, createPaginatedResponse } from '@/src/lib/pagination';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const { limit, offset } = parsePaginationParams(searchParams);
  
  try {
    // Get total count
    const countResult = await db.query(`
      select count(*) as total
      from call_events
      where type in ('quarantine','created')
    `);
    const total = parseInt(countResult.rows[0].total, 10);
    
    // Get paginated data
    const { rows } = await db.query(`
      select id, type, at, payload
      from call_events
      where type in ('quarantine','created')
      order by id desc
      limit $1 offset $2
    `, [limit, offset]);
    
    const response = createPaginatedResponse(rows, total, limit, offset);
    return NextResponse.json(response);
  } catch (err: any) {
    console.error('admin/last-webhooks GET error', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}