import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { call_id } = await req.json();
    if (!call_id) return NextResponse.json({ ok: false, error: 'missing_call_id' }, { status: 400 });

    const res = await fetch(`${process.env.APP_URL}/api/jobs/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.JOBS_SECRET}` },
      body: JSON.stringify({ callId: call_id }),
      cache: 'no-store',
    });

    if (!res.ok) return NextResponse.json({ ok: false, error: 'analyze_failed' }, { status: 500 });
    const data = await res.json();
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}