import { NextRequest, NextResponse } from 'next/server';
import { BatchProgressTracker } from '@/src/lib/sse';

export async function GET(req: NextRequest) {
  const batchId = req.nextUrl.searchParams.get('batch_id');
  
  if (!batchId) {
    return NextResponse.json({ 
      ok: false, 
      error: 'batch_id required' 
    }, { status: 400 });
  }

  const progress = BatchProgressTracker.getProgress(batchId);
  
  if (!progress) {
    return NextResponse.json({ 
      ok: false, 
      error: 'batch_not_found' 
    }, { status: 404 });
  }

  return NextResponse.json({ 
    ok: true, 
    batch_id: batchId,
    progress 
  });
}