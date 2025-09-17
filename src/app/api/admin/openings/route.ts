import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { isAdminAuthenticated } from '@/src/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get recent opening segments with real data
    const openings = await db.manyOrNone(`
      SELECT
        os.*,
        c.agent_name,
        c.campaign
      FROM opening_segments os
      JOIN calls c ON c.id = os.call_id
      ORDER BY os.created_at DESC
      LIMIT 100
    `);

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