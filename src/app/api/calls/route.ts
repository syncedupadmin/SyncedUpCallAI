import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context): Promise<NextResponse> => {
  try {
    const supabase = createSecureClient();

    const { data: calls, error } = await supabase
      .from('calls')
      .select(`
        id,
        source,
        source_ref,
        campaign,
        disposition,
        direction,
        started_at,
        ended_at,
        duration_sec,
        recording_url,
        agent_id,
        agent_name,
        phone_number,
        lead_id,
        created_at,
        updated_at,
        agency_id,
        agents(name),
        contacts(primary_phone)
      `)
      .in('agency_id', context.agencyIds)
      .eq('source', 'convoso')
      .order('started_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[SECURITY] Error fetching calls for user', context.userId, ':', error);
      return NextResponse.json({
        ok: false,
        error: 'Failed to fetch calls',
        data: []
      });
    }

    const enhancedCalls = calls?.map(call => ({
      id: call.id,
      source: call.source,
      source_ref: call.source_ref,
      campaign: call.campaign,
      disposition: call.disposition,
      direction: call.direction,
      started_at: call.started_at,
      ended_at: call.ended_at,
      duration_sec: call.duration_sec,
      recording_url: call.recording_url,
      agent_id: call.agent_id,
      agent_name: call.agent_name || (call.agents as any)?.name,
      phone_number: call.phone_number || (call.contacts as any)?.primary_phone,
      lead_id: call.lead_id,
      created_at: call.created_at,
      updated_at: call.updated_at,
      agency_id: call.agency_id
    })) || [];

    return NextResponse.json({
      ok: true,
      data: enhancedCalls
    });
  } catch (error: any) {
    console.error('[SECURITY] Error in /api/calls for user', context.userId, ':', error);
    return NextResponse.json({
      ok: false,
      error: 'Failed to fetch calls',
      data: []
    });
  }
});