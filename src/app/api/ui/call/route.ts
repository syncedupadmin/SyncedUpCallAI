import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient, validateResourceAccess } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  const supabase = createSecureClient();
  const id = req.nextUrl.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 });
  }

  try {
    const hasAccess = await validateResourceAccess(id, 'calls', context);

    if (!hasAccess) {
      console.error(`[SECURITY] User ${context.userId} attempted to access call ${id} without permission`);
      return NextResponse.json({ ok: false, error: 'call_not_found' }, { status: 404 });
    }

    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('*')
      .eq('id', id)
      .in('agency_id', context.agencyIds)
      .single();

    if (callError || !call) {
      return NextResponse.json({ ok: false, error: 'call_not_found' }, { status: 404 });
    }

    const { data: transcript } = await supabase
      .from('transcripts')
      .select('*')
      .eq('call_id', id)
      .single();

    const { data: analysis } = await supabase
      .from('analyses')
      .select('*')
      .eq('call_id', id)
      .single();

    const contact = null;

    const { data: events } = await supabase
      .from('call_events')
      .select('id, type, payload, created_at')
      .eq('call_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    const eventsChronological = events?.map(e => ({
      id: e.id,
      type: e.type,
      payload: e.payload,
      at: e.created_at
    })).reverse() || [];

    return NextResponse.json({
      ok: true,
      call: {
        ...call,
        has_policy_300_plus: false
      },
      transcript,
      analysis,
      contact,
      events: eventsChronological
    });
  } catch (error: any) {
    console.error('[SECURITY] Error fetching call details:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
});