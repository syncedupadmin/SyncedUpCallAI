import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  const supabase = createSecureClient();
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get('phone');

  if (!phone) {
    return NextResponse.json({ error: 'Phone parameter required' }, { status: 400 });
  }

  const normalizedPhone = phone.replace(/\D/g, '');

  try {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, primary_phone')
      .or(`primary_phone.eq.${normalizedPhone},primary_phone.eq.+${normalizedPhone},primary_phone.eq.+1${normalizedPhone}`);

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        phone: normalizedPhone,
        stats: {
          totalCalls: 0,
          firstCall: null,
          lastCall: null,
          totalDuration: 0
        },
        calls: []
      });
    }

    const contactIds = contacts.map(c => c.id);

    const { data: calls } = await supabase
      .from('calls')
      .select(`
        id,
        started_at,
        ended_at,
        duration_sec,
        disposition,
        recording_url,
        campaign,
        direction,
        contact_id,
        agent_id,
        agency_id,
        agents(name),
        analyses(reason_primary, qa_score, summary),
        transcripts(call_id)
      `)
      .in('agency_id', context.agencyIds)
      .in('contact_id', contactIds)
      .order('started_at', { ascending: false, nullsFirst: false });

    if (!calls) {
      return NextResponse.json({
        phone: normalizedPhone,
        stats: {
          totalCalls: 0,
          firstCall: null,
          lastCall: null,
          totalDuration: 0
        },
        calls: []
      });
    }

    const transformedCalls = calls.map((call: any) => ({
      id: call.id,
      started_at: call.started_at,
      ended_at: call.ended_at,
      duration_sec: call.duration_sec,
      disposition: call.disposition,
      recording_url: call.recording_url,
      campaign: call.campaign,
      direction: call.direction,
      agent_name: call.agents?.name || null,
      reason_primary: call.analyses?.reason_primary || null,
      qa_score: call.analyses?.qa_score || null,
      summary: call.analyses?.summary || null,
      has_transcript: call.transcripts?.call_id ? true : false,
      has_analysis: call.analyses ? true : false
    }));

    const stats = {
      totalCalls: transformedCalls.length,
      firstCall: transformedCalls.length > 0 ? transformedCalls[transformedCalls.length - 1].started_at : null,
      lastCall: transformedCalls.length > 0 ? transformedCalls[0].started_at : null,
      totalDuration: transformedCalls.reduce((sum, call) => sum + (call.duration_sec || 0), 0)
    };

    return NextResponse.json({
      phone: normalizedPhone,
      stats,
      calls: transformedCalls
    });
  } catch (err: any) {
    console.error('[SECURITY] Journey API error:', err);
    return NextResponse.json({ error: 'Failed to fetch journey' }, { status: 500 });
  }
});