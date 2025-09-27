import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated, unauthorizedResponse } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // SECURITY: Admin only - can waste API credits
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    console.error('[SECURITY] Unauthorized attempt to trigger transcription');
    return unauthorizedResponse();
  }

  try {
    const { call_id } = await req.json();
    if (!call_id) return NextResponse.json({ ok: false, error: 'missing_call_id' }, { status: 400 });

    // Check environment variables
    if (!process.env.APP_URL || !process.env.JOBS_SECRET) {
      console.error('Missing required environment variables: APP_URL or JOBS_SECRET');
      return NextResponse.json({ ok: false, error: 'configuration_error' }, { status: 500 });
    }

    const res = await fetch(`${process.env.APP_URL}/api/jobs/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.JOBS_SECRET}` },
      body: JSON.stringify({ callId: call_id }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Transcribe job failed: ${res.status} - ${errorText}`);
      return NextResponse.json({ ok: false, error: 'transcribe_failed', details: errorText }, { status: 500 });
    }
    
    const data = await res.json();
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error('Transcribe trigger error:', e);
    return NextResponse.json({ ok: false, error: 'server_error', message: e.message }, { status: 500 });
  }
}