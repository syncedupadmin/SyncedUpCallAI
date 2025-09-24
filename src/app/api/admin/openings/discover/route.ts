import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { discoverSuccessfulPatterns } from '@/lib/opening-analysis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for analysis

export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Pattern Discovery] Starting pattern discovery from real calls');

    // Discover patterns from YOUR actual call data
    const analysis = await discoverSuccessfulPatterns();

    console.log(`[Pattern Discovery] Found ${analysis.patterns.length} patterns`);

    return NextResponse.json({
      success: true,
      patterns: analysis.patterns,
      insights: analysis.insights,
      recommendations: analysis.recommendations,
      message: `Discovered ${analysis.patterns.length} successful patterns from your calls`
    });

  } catch (error: any) {
    console.error('Pattern discovery failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to discover patterns' },
      { status: 500 }
    );
  }
}