import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { parsePaginationParams, createPaginatedResponse } from '@/lib/pagination';
import { isAdminAuthenticated, unauthorizedResponse } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return unauthorizedResponse();
  }

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
    
    // When empty, ensure we return ok:true with empty rows array
    if (rows.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        rows: [], 
        total: 0,
        limit,
        offset,
        hasMore: false 
      });
    }
    
    const response = createPaginatedResponse(rows, total, limit, offset);
    return NextResponse.json({ ok: true, ...response });
  } catch (err: any) {
    console.error('admin/last-webhooks GET error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}