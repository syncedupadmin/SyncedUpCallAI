import { NextRequest, NextResponse } from 'next/server';
import { analyzeCallSimple } from '@/lib/simple-analysis';

export async function POST(request: NextRequest) {
  try {
    const { recording_url } = await request.json();

    if (!recording_url) {
      return NextResponse.json({ error: 'Recording URL required' }, { status: 400 });
    }

    console.log('Processing:', recording_url);
    const result = await analyzeCallSimple(recording_url);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: error.message },
      { status: 500 }
    );
  }
}