import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated, unauthorizedResponse } from '@/server/auth/admin';

export async function POST(req: NextRequest) {
  // SECURITY: Admin only - can cause DoS by triggering expensive batch operations
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    console.error('[SECURITY] Unauthorized attempt to trigger batch processing');
    return unauthorizedResponse();
  }

  try {
    // Get options from request body
    const { batchSize = 50, includeShortCalls = false } = await req.json().catch(() => ({}));

    // Build URL with query params
    const params = new URLSearchParams({
      batch_size: String(batchSize),
      include_short: String(includeShortCalls)
    });

    // Trigger the batch job
    const response = await fetch(`${process.env.APP_URL}/api/jobs/batch?${params}`, {
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