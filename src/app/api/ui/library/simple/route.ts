import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  try {
    const supabase = createSecureClient();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get best calls (successful dispositions, longer duration)
    const { data: bestCalls } = await supabase
      .from('calls')
      .select(`
        id,
        started_at,
        duration_sec,
        disposition,
        campaign,
        agent_name,
        agents(name),
        analyses(qa_score, reason_primary, reason_secondary, summary, risk_flags)
      `)
      .in('agency_id', context.agencyIds)
      .in('disposition', ['Completed', 'Success', 'Connected', 'Answered'])
      .gt('duration_sec', 60)
      .order('started_at', { ascending: false })
      .limit(20);

    // Get worst calls (failed dispositions or short duration)
    const { data: worstCalls } = await supabase
      .from('calls')
      .select(`
        id,
        started_at,
        duration_sec,
        disposition,
        campaign,
        agent_name,
        agents(name),
        analyses(qa_score, reason_primary, reason_secondary, summary, risk_flags)
      `)
      .in('agency_id', context.agencyIds)
      .or('disposition.in.(Failed,No Answer,Busy,Voicemail,Disconnected,Rejected),duration_sec.lt.30')
      .order('started_at', { ascending: false })
      .limit(20);

    // Get recent calls (last 7 days)
    const { data: recentCalls } = await supabase
      .from('calls')
      .select(`
        id,
        started_at,
        duration_sec,
        disposition,
        campaign,
        agent_name,
        agents(name),
        analyses(qa_score, reason_primary, reason_secondary, summary, risk_flags)
      `)
      .in('agency_id', context.agencyIds)
      .gte('started_at', sevenDaysAgo)
      .order('started_at', { ascending: false })
      .limit(20);

    // Calculate average QA score from this agency's analyzed calls
    const { data: analysisData } = await supabase
      .from('analyses')
      .select('qa_score')
      .in('agency_id', context.agencyIds)
      .not('qa_score', 'is', null);

    const avgScore = analysisData && analysisData.length > 0
      ? analysisData.reduce((sum, a) => sum + (a.qa_score || 0), 0) / analysisData.length
      : null;

    // Format call data
    const formatCall = (call: any) => ({
      id: call.id,
      started_at: call.started_at,
      duration_sec: call.duration_sec,
      disposition: call.disposition,
      campaign: call.campaign,
      agent: call.agent_name || call.agents?.name,
      qa_score: call.analyses?.[0]?.qa_score,
      reason_primary: call.analyses?.[0]?.reason_primary,
      reason_secondary: call.analyses?.[0]?.reason_secondary,
      summary: call.analyses?.[0]?.summary,
      risk_flags: call.analyses?.[0]?.risk_flags
    });

    return NextResponse.json({
      ok: true,
      best: bestCalls?.map(formatCall) || [],
      worst: worstCalls?.map(formatCall) || [],
      recent: recentCalls?.map(formatCall) || [],
      avgScore
    });

  } catch (err: any) {
    console.error('[SECURITY] ui/library/simple GET error for user', context.userId, ':', err);

    return NextResponse.json({
      ok: true,
      best: [],
      worst: [],
      recent: [],
      avgScore: null,
      error: 'Failed to load library data'
    });
  }
});