import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Trigger the batch job
    const response = await fetch(`${process.env.APP_URL}/api/jobs/batch`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.JOBS_SECRET}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ 
        ok: false, 
        error: `Batch trigger failed: ${error}` 
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Batch trigger error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 });
  }
}