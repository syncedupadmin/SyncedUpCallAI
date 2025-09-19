import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Trigger the transcription queue processor
    const response = await fetch(`${process.env.APP_URL}/api/cron/process-transcription-queue`, {
      headers: {
        'Authorization': `Bearer ${process.env.JOBS_SECRET}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({
        ok: false,
        error: `Queue processing failed: ${error}`
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('Error triggering queue processing:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}