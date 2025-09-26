import { NextRequest, NextResponse } from 'next/server';
import { analyzeCallUnified } from '@/lib/unified-analysis';

// Configure runtime for longer execution
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Maximum allowed on Vercel Pro

export async function POST(request: NextRequest) {
  try {
    const { recording_url, meta } = await request.json();

    if (!recording_url) {
      return NextResponse.json({ error: 'Recording URL required' }, { status: 400 });
    }

    console.log('[Analyze Simple] Processing:', recording_url);

    // Use unified analysis with backward compatibility
    const result = await analyzeCallUnified(recording_url, meta, {
      includeScores: false,  // Don't include legacy scores by default
      skipRebuttals: false   // Include rebuttals
    });

    console.log('[Analyze Simple] Complete:', {
      outcome: result.analysis?.outcome,
      objections: result.mentions_table?.objection_spans?.length || 0,
      rebuttals_addressed: result.rebuttals?.used?.length || 0,
      rebuttals_missed: result.rebuttals?.missed?.length || 0
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Analyze Simple] Error:', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: error.message },
      { status: 500 }
    );
  }
}