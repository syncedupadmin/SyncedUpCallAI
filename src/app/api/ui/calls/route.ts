import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';
import { parsePaginationParams, createPaginatedResponse } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  try {
    const supabase = createSecureClient();
    const { searchParams } = new URL(req.url);
    const { limit, offset } = parsePaginationParams(searchParams);

    const { data, error, count } = await supabase
      .from('calls')
      .select(`
        id,
        started_at,
        duration_sec,
        disposition,
        recording_url,
        contact_id,
        agent_id,
        agency_id,
        lead_id,
        campaign,
        direction,
        ended_at,
        agent_name,
        agent_email,
        source,
        source_ref,
        metadata,
        sale_time,
        contacts!inner(primary_phone),
        agents(name)
      `, { count: 'exact' })
      .in('agency_id', context.agencyIds)
      .order('started_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[SECURITY] calls query failed for user', context.userId, ':', error);
      const response = createPaginatedResponse([], 0, limit, offset);
      return NextResponse.json({
        ok: true,
        ...response,
        warning: 'Unable to fetch calls at this time'
      });
    }

    const transformedData = data?.map((call: any) => ({
      id: call.id,
      started_at: call.started_at,
      duration_sec: call.duration_sec,
      disposition: call.disposition,
      recording_url: call.recording_url,
      contact_id: call.contact_id,
      agent_id: call.agent_id,
      agency_id: call.agency_id,
      lead_id: call.lead_id,
      campaign: call.campaign,
      direction: call.direction,
      ended_at: call.ended_at,
      agent: call.agent_name,
      agent_email: call.agent_email,
      source: call.source,
      source_ref: call.source_ref,
      metadata: call.metadata,
      sale_time: call.sale_time,
      customer_phone: call.contacts?.primary_phone || null,
      agent_from_table: call.agents?.name || null
    })) || [];

    const response = createPaginatedResponse(transformedData, count || 0, limit, offset);
    return NextResponse.json({ ok: true, ...response });
  } catch (err: any) {
    console.error('[SECURITY] ui/calls GET error:', err.message);

    const { searchParams } = new URL(req.url);
    const { limit, offset } = parsePaginationParams(searchParams);
    const response = createPaginatedResponse([], 0, limit, offset);

    return NextResponse.json({
      ok: true,
      ...response,
      warning: 'Unable to fetch calls at this time'
    });
  }
});