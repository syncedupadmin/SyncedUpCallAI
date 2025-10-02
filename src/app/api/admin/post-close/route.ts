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

    // Get recent compliance results with segment details
    const query = callId
      ? `SELECT
          pc.*,
          pcs.transcript,
          COALESCE(pcs.agent_name, pc.agent_name) as agent_name,
          pcs.created_at as segment_created_at,
          ps.script_name,
          c.campaign
        FROM post_close_compliance pc
        LEFT JOIN post_close_segments pcs ON pcs.id = pc.segment_id
        LEFT JOIN post_close_scripts ps ON ps.id = pc.script_id
        LEFT JOIN calls c ON c.id = pc.call_id
        WHERE pc.call_id = $1
        ORDER BY pc.analyzed_at DESC
        LIMIT 100`
      : `SELECT
          pc.*,
          pcs.transcript,
          COALESCE(pcs.agent_name, pc.agent_name) as agent_name,
          pcs.created_at as segment_created_at,
          ps.script_name,
          c.campaign
        FROM post_close_compliance pc
        LEFT JOIN post_close_segments pcs ON pcs.id = pc.segment_id
        LEFT JOIN post_close_scripts ps ON ps.id = pc.script_id
        LEFT JOIN calls c ON c.id = pc.call_id
        ORDER BY pc.analyzed_at DESC
        LIMIT 100`;

    const results = callId
      ? await db.manyOrNone(query, [callId])
      : await db.manyOrNone(query);

    return NextResponse.json({
      success: true,
      results: results || []
    });

  } catch (error: any) {
    console.error('Failed to fetch post-close compliance results:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch results' },
      { status: 500 }
    );
  }
}
