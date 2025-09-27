import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  try {
    const supabase = createSecureClient();

    const { count: totalCalls } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .in('agency_id', context.agencyIds);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: lastWeekCalls } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .in('agency_id', context.agencyIds)
      .gte('started_at', sevenDaysAgo);

    const { count: previousWeekCalls } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .in('agency_id', context.agencyIds)
      .gte('started_at', fourteenDaysAgo)
      .lt('started_at', sevenDaysAgo);

    let weekChange = 0;
    if (previousWeekCalls && previousWeekCalls > 0) {
      weekChange = ((lastWeekCalls || 0) - previousWeekCalls) / previousWeekCalls * 100;
    }

    const { data: durationData } = await supabase
      .from('calls')
      .select('duration_sec')
      .in('agency_id', context.agencyIds)
      .gt('duration_sec', 0)
      .lt('duration_sec', 3600);

    let avgDurationSec = 0;
    if (durationData && durationData.length > 0) {
      const sum = durationData.reduce((acc, c) => acc + (c.duration_sec || 0), 0);
      avgDurationSec = sum / durationData.length;
    }

    const minutes = Math.floor(avgDurationSec / 60);
    const seconds = Math.round(avgDurationSec % 60);
    const avgDuration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const sorted = durationData?.map(d => d.duration_sec).sort((a, b) => a - b) || [];
    const medianDuration = sorted.length > 0
      ? sorted[Math.floor(sorted.length / 2)]
      : 0;

    const { data: dispositionData } = await supabase
      .from('calls')
      .select('disposition')
      .in('agency_id', context.agencyIds)
      .not('disposition', 'is', null)
      .neq('disposition', 'Unknown');

    const successfulDispositions = ['Completed', 'Success', 'Connected', 'Answered'];
    const successful = dispositionData?.filter(c =>
      successfulDispositions.includes(c.disposition)
    ).length || 0;
    const successRate = dispositionData && dispositionData.length > 0
      ? (successful / dispositionData.length) * 100
      : 0;

    const { data: recentCalls } = await supabase
      .from('calls')
      .select('agent_id')
      .in('agency_id', context.agencyIds)
      .gte('started_at', oneDayAgo)
      .not('agent_id', 'is', null);

    const activeAgents = new Set(recentCalls?.map(c => c.agent_id)).size;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: todayCalls } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .in('agency_id', context.agencyIds)
      .gte('started_at', todayStart.toISOString());

    const { data: todayCallsData } = await supabase
      .from('calls')
      .select('started_at')
      .in('agency_id', context.agencyIds)
      .gte('started_at', todayStart.toISOString());

    const hourlyMap = new Map<number, number>();
    todayCallsData?.forEach((call: any) => {
      const hour = new Date(call.started_at).getHours();
      hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
    });

    const hourlyDistribution = Array.from(hourlyMap.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour);

    const { data: recentCallsWithAgent } = await supabase
      .from('calls')
      .select('agent_id, agent_name, duration_sec, agents(name)')
      .in('agency_id', context.agencyIds)
      .gte('started_at', sevenDaysAgo)
      .not('agent_id', 'is', null);

    const agentMap = new Map<string, { name: string; count: number; totalDuration: number }>();
    recentCallsWithAgent?.forEach((call: any) => {
      const agentId = call.agent_id!;
      const agentName = call.agent_name || call.agents?.name || 'Unknown';

      if (!agentMap.has(agentId)) {
        agentMap.set(agentId, { name: agentName, count: 0, totalDuration: 0 });
      }

      const agent = agentMap.get(agentId)!;
      agent.count++;
      agent.totalDuration += call.duration_sec || 0;
    });

    const topAgents = Array.from(agentMap.entries())
      .map(([agent_id, data]) => ({
        agent_id,
        agent_name: data.name,
        call_count: data.count,
        avg_duration: data.count > 0 ? Math.round(data.totalDuration / data.count) : 0
      }))
      .sort((a, b) => b.call_count - a.call_count)
      .slice(0, 5);

    const dispositionMap = new Map<string, number>();
    dispositionData?.forEach((call: any) => {
      if (call.disposition) {
        dispositionMap.set(call.disposition, (dispositionMap.get(call.disposition) || 0) + 1);
      }
    });

    const totalDispositions = dispositionData?.length || 0;
    const dispositionBreakdown = Array.from(dispositionMap.entries())
      .map(([disposition, count]) => ({
        disposition,
        count,
        percentage: totalDispositions > 0 ? Math.round((count / totalDispositions) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const { data: campaignData } = await supabase
      .from('calls')
      .select('campaign, duration_sec, disposition')
      .in('agency_id', context.agencyIds)
      .gte('started_at', sevenDaysAgo)
      .not('campaign', 'is', null);

    const campaignMap = new Map<string, {
      count: number;
      totalDuration: number;
      successful: number;
    }>();

    campaignData?.forEach((call: any) => {
      const campaign = call.campaign!;

      if (!campaignMap.has(campaign)) {
        campaignMap.set(campaign, { count: 0, totalDuration: 0, successful: 0 });
      }

      const stats = campaignMap.get(campaign)!;
      stats.count++;
      stats.totalDuration += call.duration_sec || 0;

      if (successfulDispositions.includes(call.disposition)) {
        stats.successful++;
      }
    });

    const campaignStats = Array.from(campaignMap.entries())
      .map(([campaign, stats]) => ({
        campaign,
        total_calls: stats.count,
        avg_duration: stats.count > 0 ? Math.round(stats.totalDuration / stats.count) : 0,
        successful_calls: stats.successful,
        success_rate: stats.count > 0
          ? Math.round((stats.successful / stats.count) * 1000) / 10
          : 0
      }))
      .sort((a, b) => b.total_calls - a.total_calls)
      .slice(0, 5);

    return NextResponse.json({
      ok: true,
      metrics: {
        totalCalls: totalCalls || 0,
        avgDuration,
        successRate: Math.round(successRate * 10) / 10,
        activeAgents,
        weekChange: Math.round(weekChange * 10) / 10,
        todayCalls: todayCalls || 0,
        medianDuration: Math.round(medianDuration)
      },
      charts: {
        hourlyDistribution,
        topAgents,
        dispositionBreakdown,
        campaignStats
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[SECURITY] Error fetching dashboard stats:', error);

    return NextResponse.json({
      ok: false,
      error: error.message,
      metrics: {
        totalCalls: 0,
        avgDuration: '0s',
        successRate: 0,
        activeAgents: 0,
        weekChange: 0,
        todayCalls: 0,
        medianDuration: 0
      },
      charts: {
        hourlyDistribution: [],
        topAgents: [],
        dispositionBreakdown: [],
        campaignStats: []
      }
    });
  }
});