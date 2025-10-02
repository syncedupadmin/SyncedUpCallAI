import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check for call_id filter
    const { searchParams } = new URL(req.url);
    const callId = searchParams.get('call_id');

    // Get recent opening segments with real data
    const query = callId
      ? `SELECT
          os.*,
          c.agent_name,
          c.campaign
        FROM opening_segments os
        JOIN calls c ON c.id = os.call_id
        WHERE os.call_id = $1
        ORDER BY os.created_at DESC
        LIMIT 100`
      : `SELECT
          os.*,
          c.agent_name,
          c.campaign
        FROM opening_segments os
        JOIN calls c ON c.id = os.call_id
        ORDER BY os.created_at DESC
        LIMIT 100`;

    const openings = callId
      ? await db.manyOrNone(query, [callId])
      : await db.manyOrNone(query);

    return NextResponse.json({
      success: true,
      openings: openings || []
    });

  } catch (error: any) {
    console.error('Failed to fetch openings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch openings' },
      { status: 500 }
    );
  }
}