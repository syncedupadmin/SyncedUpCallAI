/**
 * Agent Compliance Manager Component
 * Provides 2-part workflow interface:
 * 1. Agent discovery and selection
 * 2. Sales fetching and compliance monitoring
 */

'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, RefreshCw, Users, Download, CheckCircle, AlertCircle, Clock, Activity } from 'lucide-react';

interface Agent {
  id: string;
  convoso_agent_id: string;
  agent_name: string;
  agent_email?: string;
  monitor_enabled: boolean;
  compliance_threshold: number;
  auto_sync_sales: boolean;
  last_synced_at?: string;
  sync_status: 'pending' | 'success' | 'failed';
  total_sales_synced: number;
  pending_segments?: number;
  analyzed_segments?: number;
}

interface SyncLog {
  id: string;
  sync_type: 'agent_discovery' | 'sales_fetch';
  agent_name?: string;
  calls_fetched: number;
  sales_found: number;
  compliance_segments_created: number;
  sync_status: string;
  error_message?: string;
  created_at: string;
}

interface SyncStats {
  total_agents: number;
  monitored_agents: number;
  total_segments: number;
  segments_24h: number;
  analyzed_segments: number;
  avg_compliance_score: number;
  passed_count: number;
  failed_count: number;
}

export default function AgentComplianceManager() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    end: new Date()
  });

  // Fetch agent configurations and sync status
  const fetchAgentStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/post-close/fetch-sales', {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setAgents(data.data.agents || []);
        setSyncLogs(data.data.sync_logs || []);
        setStats(data.data.stats || null);
      }
    } catch (error: any) {
      console.error('Failed to fetch agent status:', error);
      alert('Failed to load agent configurations');
    } finally {
      setLoading(false);
    }
  };

  // Execute 2-part workflow: Discover agents and fetch sales
  const executeConvosoSync = async () => {
    setSyncing(true);
    try {
      const payload: any = {
        auto_discover: true,
        process_compliance: true
      };

      if (dateRange.start && dateRange.end) {
        payload.date_range = {
          start: dateRange.start.toISOString().split('T')[0],
          end: dateRange.end.toISOString().split('T')[0]
        };
      }

      const response = await fetch('/api/admin/post-close/fetch-sales', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Sync failed');
      }

      const result = await response.json();

      if (result.success) {
        alert(
          `Sync completed: ${result.data.agents_discovered} agents discovered, ${result.data.sales_fetched} sales fetched`
        );

        // Refresh the display
        await fetchAgentStatus();
      } else {
        throw new Error(result.error || 'Sync failed');
      }
    } catch (error: any) {
      console.error('Sync failed:', error);
      alert(`Sync failed: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Toggle agent monitoring
  const toggleAgentMonitoring = async (agentId: string, enabled: boolean) => {
    try {
      const response = await fetch('/api/admin/post-close/fetch-sales', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: agentId,
          updates: {
            monitor_enabled: enabled,
            auto_sync_sales: enabled
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update agent');
      }

      alert(`Agent monitoring ${enabled ? 'enabled' : 'disabled'}`);
      await fetchAgentStatus();
    } catch (error: any) {
      console.error('Failed to update agent:', error);
      alert('Failed to update agent configuration');
    }
  };

  // Initial load
  useEffect(() => {
    fetchAgentStatus();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!syncing && !discovering) {
        fetchAgentStatus();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [syncing, discovering]);

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Compliance Agent Manager</h2>
            <p className="text-sm text-gray-400">
              Monitor agent compliance with 2-part Convoso integration
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAgentStatus}
              disabled={loading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={executeConvosoSync}
              disabled={syncing}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Sync Sales
                </>
              )}
            </button>
          </div>
        </div>
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{stats.monitored_agents}</div>
              <div className="text-sm text-gray-400">Monitored Agents</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{stats.segments_24h}</div>
              <div className="text-sm text-gray-400">Sales (24h)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {stats.avg_compliance_score ? stats.avg_compliance_score.toFixed(1) : '0'}%
              </div>
              <div className="text-sm text-gray-400">Avg Score</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {stats.passed_count && stats.analyzed_segments
                  ? ((stats.passed_count / stats.analyzed_segments) * 100).toFixed(1)
                  : '0'}%
              </div>
              <div className="text-sm text-gray-400">Pass Rate</div>
            </div>
          </div>
        )}
      </div>

      {/* Date Range Selector */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-4">Sync Date Range</h3>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Start Date</label>
            <input
              type="date"
              value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value ? new Date(e.target.value) : null })}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">End Date</label>
            <input
              type="date"
              value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value ? new Date(e.target.value) : null })}
              className="px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Agent List */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white">Monitored Agents</h3>
          <p className="text-sm text-gray-400">
            {agents.length} agents configured for compliance monitoring
          </p>
        </div>
        <div className="space-y-4">
          {agents.length === 0 ? (
            <div className="bg-yellow-500/10 rounded-lg p-4 border border-yellow-500/20 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="font-medium text-yellow-400">No agents configured</p>
                <p className="text-sm text-gray-400">
                  Click "Sync Sales" to discover agents from Convoso
                </p>
              </div>
            </div>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{agent.agent_name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        agent.sync_status === 'success'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : agent.sync_status === 'failed'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}
                    >
                      {agent.sync_status}
                    </span>
                    {agent.monitor_enabled && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        Monitoring
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                    <span>ID: {agent.convoso_agent_id}</span>
                    <span>Sales: {agent.total_sales_synced}</span>
                    {agent.pending_segments !== undefined && (
                      <span>Pending: {agent.pending_segments}</span>
                    )}
                    {agent.analyzed_segments !== undefined && (
                      <span>Analyzed: {agent.analyzed_segments}</span>
                    )}
                    {agent.last_synced_at && (
                      <span>
                        Last sync: {new Date(agent.last_synced_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAgentMonitoring(agent.convoso_agent_id, !agent.monitor_enabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      agent.monitor_enabled ? 'bg-cyan-600' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        agent.monitor_enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sync History */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white">Sync History</h3>
          <p className="text-sm text-gray-400">Recent Convoso synchronization logs</p>
        </div>
        <div className="space-y-2">
          {syncLogs.length === 0 ? (
            <p className="text-sm text-gray-500">No sync history available</p>
          ) : (
            syncLogs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2">
                  {log.sync_status === 'success' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : log.sync_status === 'failed' ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-yellow-500" />
                  )}
                  <div className="text-white">
                    <span className="font-medium">
                      {log.sync_type === 'agent_discovery' ? 'Agent Discovery' : 'Sales Fetch'}
                    </span>
                    {log.agent_name && <span> - {log.agent_name}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-gray-400">
                  <span>Calls: {log.calls_fetched}</span>
                  <span>Sales: {log.sales_found}</span>
                  <span>Segments: {log.compliance_segments_created}</span>
                  <span>{new Date(log.created_at).toLocaleString()}</span>
                </div>
                {log.error_message && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                    {log.error_message}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}