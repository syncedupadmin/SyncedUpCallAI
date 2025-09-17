import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { isAdminAuthenticated } from '@/src/server/auth/admin';
import { extractOpeningsInBatch } from '@/src/lib/opening-extractor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for processing

export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { limit = 100 } = await req.json();

    console.log(`[Opening Extraction] Starting extraction for ${limit} calls`);

    // Extract openings from real calls
    const results = await extractOpeningsInBatch(Math.min(limit, 1000)); // Cap at 1000 for safety

    console.log(`[Opening Extraction] Complete:`, results);

    return NextResponse.json({
      success: true,
      ...results,
      message: `Extracted ${results.extracted} openings from your calls`
    });

  } catch (error: any) {
    console.error('Opening extraction failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to extract openings' },
      { status: 500 }
    );
  }
}