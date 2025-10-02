import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { extractSegmentsInBatch } from '@/lib/post-close-analysis';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const limit = body.limit || 100;

    const results = await extractSegmentsInBatch(limit);

    return NextResponse.json({
      success: true,
      ...results
    });

  } catch (error: any) {
    console.error('Extraction failed:', error);
    return NextResponse.json(
      { error: error.message || 'Extraction failed' },
      { status: 500 }
    );
  }
}
