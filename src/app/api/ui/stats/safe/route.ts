import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  try {
    const supabase = createSecureClient();

    // Get total calls count
    const { count: totalCalls } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .in('agency_id', context.agencyIds);

    // Get calls from last week for comparison
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: lastWeekCalls } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .in('agency_id', context.agencyIds)
      .gte('started_at', sevenDaysAgo);

    // Get calls from previous week for percentage calculation
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { count: previousWeekCalls } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .in('agency_id', context.agencyIds)
      .gte('started_at', fourteenDaysAgo)
      .lt('started_at', sevenDaysAgo);

    // Calculate week-over-week change
    let weekChange = 0;
    if (previousWeekCalls && previousWeekCalls > 0) {
      weekChange = ((lastWeekCalls || 0) - previousWeekCalls) / previousWeekCalls * 100;
    }

    // Get average duration (in seconds)
    const { data: durationData } = await supabase
      .from('calls')
      .select('duration_sec')
      .in('agency_id', context.agencyIds)
      .gt('duration_sec', 0)
      .lt('duration_sec', 3600);

    const avgDurationSec = durationData && durationData.length > 0
      ? durationData.reduce((sum, call) => sum + (call.duration_sec || 0), 0) / durationData.length
      : 0;
    
    // Format duration as "Xm Ys"
    const minutes = Math.floor(avgDurationSec / 60);
    const seconds = Math.round(avgDurationSec % 60);
    const avgDuration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    // Get success rate (based on disposition)
    const { data: allDispositionCalls } = await supabase
      .from('calls')
      .select('disposition')
      .in('agency_id', context.agencyIds)
      .not('disposition', 'is', null)
      .neq('disposition', 'Unknown');

    let successRate = 0;
    if (allDispositionCalls && allDispositionCalls.length > 0) {
      const successful = allDispositionCalls.filter(c =>
        ['Completed', 'Success', 'Connected', 'Answered'].includes(c.disposition || '')
      ).length;
      successRate = (successful / allDispositionCalls.length) * 100;
    }

    // Get active agents count (unique agents in last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentAgentCalls } = await supabase
      .from('calls')
      .select('agent_id')
      .in('agency_id', context.agencyIds)
      .gte('started_at', oneDayAgo)
      .not('agent_id', 'is', null);

    const activeAgents = recentAgentCalls
      ? new Set(recentAgentCalls.map(c => c.agent_id)).size
      : 0;

    // Get today's call count
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayCalls } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .in('agency_id', context.agencyIds)
      .gte('started_at', todayStart.toISOString());

    return NextResponse.json({
      ok: true,
      metrics: {
        totalCalls: totalCalls || 0,
        avgDuration,
        successRate: Math.round(successRate * 10) / 10,
        activeAgents,
        weekChange: Math.round(weekChange * 10) / 10,
        todayCalls: todayCalls || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[SECURITY] Error fetching stats for user', context.userId, ':', error);
    
    // Return default values on error but keep ok:true
    return NextResponse.json({
      ok: true,
      metrics: {
        totalCalls: 0,
        avgDuration: '0s',
        successRate: 0,
        activeAgents: 0,
        weekChange: 0,
        todayCalls: 0
      }
    });
  }
});