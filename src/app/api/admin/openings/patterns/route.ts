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
    // Get discovered patterns from YOUR data
    const patterns = await db.manyOrNone(`
      SELECT *
      FROM opening_patterns
      WHERE success_rate > 0.5
      ORDER BY success_rate DESC, sample_count DESC
      LIMIT 50
    `);

    return NextResponse.json({
      success: true,
      patterns: patterns || []
    });

  } catch (error: any) {
    console.error('Failed to fetch patterns:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch patterns' },
      { status: 500 }
    );
  }
}