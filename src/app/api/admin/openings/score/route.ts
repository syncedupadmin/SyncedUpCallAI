import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { scoreOpening } from '@/lib/opening-analysis';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { transcript, duration } = await req.json();

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript is required' },
        { status: 400 }
      );
    }

    // Score the opening against YOUR successful patterns
    const result = await scoreOpening(transcript, duration);

    return NextResponse.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    console.error('Failed to score opening:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to score opening' },
      { status: 500 }
    );
  }
}