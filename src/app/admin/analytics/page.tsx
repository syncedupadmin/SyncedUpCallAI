'use client';

import { useState, useEffect } from 'react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Phone,
  Clock,
  Activity,
  BarChart3,
  PieChart,
  Calendar,
  Download
} from 'lucide-react';

interface AnalyticsData {
  calls: {
    total: number;
    today: number;
    week: number;
    month: number;
    byDirection: { inbound: number; outbound: number };
    byDisposition: Record<string, number>;
    avgDuration: number;
    peakHour: string;
  };
  leads: {
    total: number;
    converted: number;
    conversionRate: number;
    byCampaign: Record<string, number>;
  };
  agents: {
    total: number;
    active: number;
    topPerformer: { name: string; calls: number };
    avgCallsPerAgent: number;
  };
  webhooks: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  };
  trends: {
    callsOverTime: Array<{ date: string; count: number }>;
    leadsOverTime: Array<{ date: string; count: number }>;
  };
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'today' | '7days' | '30days' | '90days'>('7days');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [dateRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Fetch calls data
      const callsRes = await fetch('/api/admin/calls');
      const callsData = await callsRes.json();
      const calls = callsData.data || [];

      // Fetch leads data
      const leadsRes = await fetch('/api/admin/leads');
      const leadsData = await leadsRes.json();
      const leads = leadsData.data || [];

      // Fetch webhook logs
      const webhooksRes = await fetch('/api/admin/webhook-logs');
      const webhooksData = await webhooksRes.json();
      const webhooks = webhooksData.data || [];

      // Process analytics
      const now = new Date();
      const today = startOfDay(now);
      const weekAgo = subDays(now, 7);
      const monthAgo = subDays(now, 30);

      // Calls analytics
      const todayCalls = calls.filter((c: any) => new Date(c.started_at) >= today);
      const weekCalls = calls.filter((c: any) => new Date(c.started_at) >= weekAgo);
      const monthCalls = calls.filter((c: any) => new Date(c.started_at) >= monthAgo);

      const callsByDirection = {
        inbound: calls.filter((c: any) => c.direction === 'inbound').length,
        outbound: calls.filter((c: any) => c.direction === 'outbound').length
      };

      const callsByDisposition = calls.reduce((acc: any, call: any) => {
        const disp = call.disposition || 'unknown';
        acc[disp] = (acc[disp] || 0) + 1;
        return acc;
      }, {});

      const totalDuration = calls.reduce((acc: any, c: any) => acc + (c.duration_sec || 0), 0);
      const avgDuration = calls.length > 0 ? Math.round(totalDuration / calls.length) : 0;

      // Find peak hour
      const hourCounts: Record<number, number> = {};
      calls.forEach((call: any) => {
        if (call.started_at) {
          const hour = new Date(call.started_at).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }
      });
      const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

      // Leads analytics
      const leadsByCampaign = leads.reduce((acc: any, lead: any) => {
        const campaign = lead.campaign || 'unknown';
        acc[campaign] = (acc[campaign] || 0) + 1;
        return acc;
      }, {});

      const convertedLeads = leads.filter((l: any) => l.converted).length;
      const conversionRate = leads.length > 0 ? (convertedLeads / leads.length) * 100 : 0;

      // Agent analytics
      const agentCalls: Record<string, number> = {};
      calls.forEach((call: any) => {
        if (call.agent_name) {
          agentCalls[call.agent_name] = (agentCalls[call.agent_name] || 0) + 1;
        }
      });

      const topAgent = Object.entries(agentCalls).sort((a, b) => b[1] - a[1])[0];
      const totalAgents = Object.keys(agentCalls).length;
      const avgCallsPerAgent = totalAgents > 0 ? Math.round(calls.length / totalAgents) : 0;

      // Webhook analytics
      const successfulWebhooks = webhooks.filter((w: any) => w.status === 'success').length;
      const webhookSuccessRate = webhooks.length > 0 ? (successfulWebhooks / webhooks.length) * 100 : 0;

      // Trends over time
      const callTrends: Record<string, number> = {};
      const leadTrends: Record<string, number> = {};

      for (let i = 6; i >= 0; i--) {
        const date = format(subDays(now, i), 'MMM dd');
        const dayStart = startOfDay(subDays(now, i));
        const dayEnd = endOfDay(subDays(now, i));

        callTrends[date] = calls.filter((c: any) => {
          const callDate = new Date(c.started_at);
          return callDate >= dayStart && callDate <= dayEnd;
        }).length;

        leadTrends[date] = leads.filter((l: any) => {
          const leadDate = new Date(l.created_at);
          return leadDate >= dayStart && leadDate <= dayEnd;
        }).length;
      }

      setData({
        calls: {
          total: calls.length,
          today: todayCalls.length,
          week: weekCalls.length,
          month: monthCalls.length,
          byDirection: callsByDirection,
          byDisposition: callsByDisposition,
          avgDuration,
          peakHour: peakHour ? `${peakHour[0]}:00` : 'N/A'
        },
        leads: {
          total: leads.length,
          converted: convertedLeads,
          conversionRate,
          byCampaign: leadsByCampaign
        },
        agents: {
          total: totalAgents,
          active: totalAgents, // For now, assume all are active
          topPerformer: topAgent ? { name: topAgent[0], calls: topAgent[1] } : { name: 'N/A', calls: 0 },
          avgCallsPerAgent
        },
        webhooks: {
          total: webhooks.length,
          successful: successfulWebhooks,
          failed: webhooks.length - successfulWebhooks,
          successRate: webhookSuccessRate
        },
        trends: {
          callsOverTime: Object.entries(callTrends).map(([date, count]) => ({ date, count })),
          leadsOverTime: Object.entries(leadTrends).map(([date, count]) => ({ date, count }))
        }
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAnalytics();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (loading && !data) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-400">Loading analytics...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent mb-2">
            Analytics Dashboard
          </h1>
          <p className="text-gray-400">System performance and insights</p>
        </div>

        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:border-purple-500 focus:outline-none"
          >
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
          </select>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition flex items-center gap-2"
          >
            <Activity className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {data && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-xl rounded-xl border border-blue-500/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <Phone className="w-8 h-8 text-blue-400" />
                <span className="text-xs text-blue-400 font-medium">CALLS</span>
              </div>
              <div className="text-3xl font-bold text-white mb-2">{data.calls.total}</div>
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-gray-400">
                  {data.calls.today} today, {data.calls.week} this week
                </span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-xl rounded-xl border border-green-500/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <Users className="w-8 h-8 text-green-400" />
                <span className="text-xs text-green-400 font-medium">LEADS</span>
              </div>
              <div className="text-3xl font-bold text-white mb-2">{data.leads.total}</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">
                  {data.leads.conversionRate.toFixed(1)}% conversion rate
                </span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-xl rounded-xl border border-purple-500/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <Clock className="w-8 h-8 text-purple-400" />
                <span className="text-xs text-purple-400 font-medium">AVG DURATION</span>
              </div>
              <div className="text-3xl font-bold text-white mb-2">
                {formatDuration(data.calls.avgDuration)}
              </div>
              <div className="text-sm text-gray-400">
                Peak hour: {data.calls.peakHour}
              </div>
            </div>

            <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 backdrop-blur-xl rounded-xl border border-orange-500/20 p-6">
              <div className="flex items-center justify-between mb-4">
                <Activity className="w-8 h-8 text-orange-400" />
                <span className="text-xs text-orange-400 font-medium">WEBHOOKS</span>
              </div>
              <div className="text-3xl font-bold text-white mb-2">{data.webhooks.total}</div>
              <div className="text-sm text-gray-400">
                {data.webhooks.successRate.toFixed(1)}% success rate
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Call Trends */}
            <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                Call Volume Trend
              </h3>
              <div className="space-y-3">
                {data.trends.callsOverTime.map((item, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-16">{item.date}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full flex items-center justify-end pr-2"
                        style={{
                          width: `${(item.count / Math.max(...data.trends.callsOverTime.map(d => d.count))) * 100}%`
                        }}
                      >
                        <span className="text-xs text-white font-medium">{item.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Call Distribution */}
            <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-purple-400" />
                Call Distribution
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">Direction</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3">
                        <div className="text-xs text-green-400 mb-1">Inbound</div>
                        <div className="text-xl font-bold text-white">{data.calls.byDirection.inbound}</div>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-3">
                        <div className="text-xs text-blue-400 mb-1">Outbound</div>
                        <div className="text-xl font-bold text-white">{data.calls.byDirection.outbound}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-400 mb-2">By Disposition</div>
                  <div className="space-y-2">
                    {Object.entries(data.calls.byDisposition).slice(0, 5).map(([disp, count]) => (
                      <div key={disp} className="flex justify-between items-center">
                        <span className="text-sm text-gray-300 capitalize">{disp}</span>
                        <span className="text-sm font-medium text-white">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Agent Performance */}
          <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800 p-6 mb-8">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-400" />
              Agent Performance
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-sm text-gray-400 mb-2">Total Agents</div>
                <div className="text-2xl font-bold text-white">{data.agents.total}</div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-2">Top Performer</div>
                <div className="text-lg font-semibold text-white">{data.agents.topPerformer.name}</div>
                <div className="text-sm text-gray-500">{data.agents.topPerformer.calls} calls</div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-2">Avg Calls/Agent</div>
                <div className="text-2xl font-bold text-white">{data.agents.avgCallsPerAgent}</div>
              </div>
            </div>
          </div>

          {/* Campaign Performance */}
          <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-400" />
              Campaign Performance
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(data.leads.byCampaign).map(([campaign, count]) => (
                <div key={campaign} className="bg-gray-800/50 rounded-lg p-4">
                  <div className="text-sm text-gray-400 mb-1 truncate">{campaign}</div>
                  <div className="text-xl font-bold text-white">{count as number} leads</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}