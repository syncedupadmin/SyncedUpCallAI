'use client';

import { useState, useEffect } from 'react';
import { Users, TrendingUp, TrendingDown, CheckCircle, XCircle, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';

interface AgentStats {
  agent_name: string;
  total_analyzed: number;
  total_passed: number;
  total_failed: number;
  pass_rate: number;
  avg_score: number;
  recent_checks: Array<{
    id: string;
    call_id: string;
    overall_score: number;
    compliance_passed: boolean;
    analyzed_at: string;
  }>;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'pass_rate' | 'total_analyzed' | 'avg_score'>('pass_rate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/admin/post-close/agents');
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const sortedAgents = [...agents].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });

  const toggleSort = (field: 'pass_rate' | 'total_analyzed' | 'avg_score') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const toggleExpanded = (agentName: string) => {
    setExpandedAgent(expandedAgent === agentName ? null : agentName);
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading agents...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Agent Performance</h1>
        <p className="text-gray-400 mt-1">Compliance statistics by agent</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-gray-400">Total Agents</h3>
            <Users className="w-5 h-5 text-cyan-500" />
          </div>
          <p className="text-3xl font-bold text-white">{agents.length}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-gray-400">Avg Pass Rate</h3>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-green-500">
            {agents.length > 0
              ? Math.round(agents.reduce((sum, a) => sum + a.pass_rate, 0) / agents.length)
              : 0}%
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-gray-400">Total Calls</h3>
            <BarChart3 className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-white">
            {agents.reduce((sum, a) => sum + a.total_analyzed, 0)}
          </p>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">Sort by:</span>
          <button
            onClick={() => toggleSort('pass_rate')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              sortBy === 'pass_rate'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-900 text-gray-400 hover:text-white'
            }`}
          >
            Pass Rate {sortBy === 'pass_rate' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
          <button
            onClick={() => toggleSort('total_analyzed')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              sortBy === 'total_analyzed'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-900 text-gray-400 hover:text-white'
            }`}
          >
            Total Calls {sortBy === 'total_analyzed' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
          <button
            onClick={() => toggleSort('avg_score')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              sortBy === 'avg_score'
                ? 'bg-cyan-600 text-white'
                : 'bg-gray-900 text-gray-400 hover:text-white'
            }`}
          >
            Avg Score {sortBy === 'avg_score' && (sortOrder === 'desc' ? '↓' : '↑')}
          </button>
        </div>
      </div>

      {/* Agents List */}
      <div className="space-y-4">
        {sortedAgents.length > 0 ? sortedAgents.map((agent) => (
          <div key={agent.agent_name} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            {/* Agent Summary Row */}
            <button
              onClick={() => toggleExpanded(agent.agent_name)}
              className="w-full p-6 flex items-center justify-between hover:bg-gray-750 transition-colors text-left"
            >
              <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
                {/* Agent Name */}
                <div className="md:col-span-2">
                  <h3 className="text-lg font-bold text-white">{agent.agent_name}</h3>
                  <p className="text-sm text-gray-400 mt-1">{agent.total_analyzed} calls analyzed</p>
                </div>

                {/* Pass Rate */}
                <div className="text-center">
                  <p className={`text-2xl font-bold ${
                    agent.pass_rate >= 80 ? 'text-green-500' : agent.pass_rate >= 60 ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {Math.round(agent.pass_rate)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Pass Rate</p>
                </div>

                {/* Avg Score */}
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{Math.round(agent.avg_score)}%</p>
                  <p className="text-xs text-gray-500 mt-1">Avg Score</p>
                </div>

                {/* Pass/Fail Count */}
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-sm font-bold text-green-500">{agent.total_passed}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-500" />
                    <span className="text-sm font-bold text-red-500">{agent.total_failed}</span>
                  </div>
                </div>
              </div>

              {/* Expand Icon */}
              <div className="ml-4">
                {expandedAgent === agent.agent_name ? (
                  <ChevronUp className="w-6 h-6 text-gray-400" />
                ) : (
                  <ChevronDown className="w-6 h-6 text-gray-400" />
                )}
              </div>
            </button>

            {/* Expanded Recent Checks */}
            {expandedAgent === agent.agent_name && agent.recent_checks && agent.recent_checks.length > 0 && (
              <div className="border-t border-gray-700 p-6 bg-gray-900/50">
                <h4 className="text-lg font-bold text-white mb-4">Recent Checks</h4>
                <div className="space-y-3">
                  {agent.recent_checks.map((check) => (
                    <div key={check.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm text-gray-400">Call ID: {check.call_id}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(check.analyzed_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-white">{Math.round(check.overall_score)}%</span>
                        {check.compliance_passed ? (
                          <CheckCircle className="w-6 h-6 text-green-500" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )) : (
          <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
            <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No agent data available</p>
            <p className="text-sm text-gray-500 mt-1">Agent statistics will appear after calls are analyzed</p>
          </div>
        )}
      </div>

      {/* Performance Tiers */}
      {agents.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-lg font-bold text-white mb-4">Performance Distribution</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/30">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <h3 className="font-bold text-green-400">High Performers</h3>
              </div>
              <p className="text-3xl font-bold text-white">
                {agents.filter(a => a.pass_rate >= 80).length}
              </p>
              <p className="text-sm text-gray-400 mt-1">≥80% pass rate</p>
            </div>

            <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-5 h-5 text-yellow-500" />
                <h3 className="font-bold text-yellow-400">Medium Performers</h3>
              </div>
              <p className="text-3xl font-bold text-white">
                {agents.filter(a => a.pass_rate >= 60 && a.pass_rate < 80).length}
              </p>
              <p className="text-sm text-gray-400 mt-1">60-79% pass rate</p>
            </div>

            <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/30">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <h3 className="font-bold text-red-400">Needs Improvement</h3>
              </div>
              <p className="text-3xl font-bold text-white">
                {agents.filter(a => a.pass_rate < 60).length}
              </p>
              <p className="text-sm text-gray-400 mt-1">&lt;60% pass rate</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
