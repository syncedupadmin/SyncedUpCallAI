import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';
import { parsePaginationParams, createPaginatedResponse } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  const supabase = createSecureClient();
  const { searchParams } = new URL(req.url);
  const { limit, offset } = parsePaginationParams(searchParams);
  const category = searchParams.get('category') || 'both';

  try {
    if (category === 'best' || category === 'both') {
      const { data: bestData, error: bestError, count: bestCount } = await supabase
        .from('calls')
        .select(`
          id,
          started_at,
          agent_id,
          agency_id,
          agents(name),
          analyses!inner(qa_score, reason_primary, summary)
        `, { count: 'exact' })
        .in('agency_id', context.agencyIds)
        .gte('analyses.qa_score', 85)
        .order('analyses.qa_score', { ascending: false })
        .order('started_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (bestError) {
        console.error('[SECURITY] library best calls query failed:', bestError);
        if (category === 'best') {
          return NextResponse.json({ ok: false, error: 'query_failed' }, { status: 500 });
        }
      }

      if (category === 'best') {
        const transformedBest = bestData?.map((call: any) => ({
          id: call.id,
          started_at: call.started_at,
          agent: call.agents?.name || null,
          qa_score: call.analyses?.qa_score || null,
          reason_primary: call.analyses?.reason_primary || null,
          summary: call.analyses?.summary || null
        })) || [];

        const response = createPaginatedResponse(transformedBest, bestCount || 0, limit, offset);
        return NextResponse.json({ ok: true, category: 'best', ...response });
      }
    }

    if (category === 'worst' || category === 'both') {
      const { data: worstData, error: worstError, count: worstCount } = await supabase
        .from('calls')
        .select(`
          id,
          started_at,
          agent_id,
          agency_id,
          agents(name),
          analyses!inner(qa_score, reason_primary, summary)
        `, { count: 'exact' })
        .in('agency_id', context.agencyIds)
        .or('qa_score.lt.55,reason_primary.in.(trust_scam_fear,bank_decline)', { foreignTable: 'analyses' })
        .order('analyses.qa_score', { ascending: true })
        .order('started_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (worstError) {
        console.error('[SECURITY] library worst calls query failed:', worstError);
        if (category === 'worst') {
          return NextResponse.json({ ok: false, error: 'query_failed' }, { status: 500 });
        }
      }

      if (category === 'worst') {
        const transformedWorst = worstData?.map((call: any) => ({
          id: call.id,
          started_at: call.started_at,
          agent: call.agents?.name || null,
          qa_score: call.analyses?.qa_score || null,
          reason_primary: call.analyses?.reason_primary || null,
          summary: call.analyses?.summary || null
        })) || [];

        const response = createPaginatedResponse(transformedWorst, worstCount || 0, limit, offset);
        return NextResponse.json({ ok: true, category: 'worst', ...response });
      }
    }

    if (category === 'both') {
      const { data: bestData } = await supabase
        .from('calls')
        .select(`
          id,
          started_at,
          agents(name),
          analyses!inner(qa_score, reason_primary, summary)
        `)
        .in('agency_id', context.agencyIds)
        .gte('analyses.qa_score', 85)
        .order('analyses.qa_score', { ascending: false })
        .order('started_at', { ascending: false })
        .limit(20);

      const { data: worstData } = await supabase
        .from('calls')
        .select(`
          id,
          started_at,
          agents(name),
          analyses!inner(qa_score, reason_primary, summary)
        `)
        .in('agency_id', context.agencyIds)
        .or('qa_score.lt.55,reason_primary.in.(trust_scam_fear,bank_decline)', { foreignTable: 'analyses' })
        .order('analyses.qa_score', { ascending: true })
        .order('started_at', { ascending: false })
        .limit(20);

      const transformedBest = bestData?.map((call: any) => ({
        id: call.id,
        started_at: call.started_at,
        agent: call.agents?.name || null,
        qa_score: call.analyses?.qa_score || null,
        reason_primary: call.analyses?.reason_primary || null,
        summary: call.analyses?.summary || null
      })) || [];

      const transformedWorst = worstData?.map((call: any) => ({
        id: call.id,
        started_at: call.started_at,
        agent: call.agents?.name || null,
        qa_score: call.analyses?.qa_score || null,
        reason_primary: call.analyses?.reason_primary || null,
        summary: call.analyses?.summary || null
      })) || [];

      return NextResponse.json({ ok: true, best: transformedBest, worst: transformedWorst });
    }

    return NextResponse.json({ ok: false, error: 'invalid_category' }, { status: 400 });
  } catch (err: any) {
    console.error('[SECURITY] ui/library GET error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
});