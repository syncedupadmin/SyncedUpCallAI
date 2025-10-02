'use client';

import { useState, useEffect } from 'react';
import { Shield, CheckCircle, XCircle, TrendingUp, TrendingDown, Users, FileText, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface Stats {
  total_analyzed: number;
  total_passed: number;
  total_failed: number;
  pass_rate: number;
  avg_compliance_score: number;
}

interface Script {
  id: string;
  script_name: string;
  script_version: string;
  strict_mode: boolean;
  updated_at: string;
}

interface RecentCheck {
  id: string;
  agent_name: string;
  overall_score: number;
  compliance_passed: boolean;
  analyzed_at: string;
  missing_phrases: string[];
}

interface AgentSummary {
  agent_name: string;
  pass_rate: number;
  total_analyzed: number;
}

export default function ComplianceDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeScript, setActiveScript] = useState<Script | null>(null);
  const [recentChecks, setRecentChecks] = useState<RecentCheck[]>([]);
  const [topAgents, setTopAgents] = useState<AgentSummary[]>([]);
  const [bottomAgents, setBottomAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load stats
      const statsRes = await fetch('/api/admin/post-close/stats');
      const statsData = await statsRes.json();
      setStats({
        total_analyzed: statsData.total_analyzed || 0,
        total_passed: Math.round((statsData.pass_rate || 0) * (statsData.total_analyzed || 0)),
        total_failed: (statsData.total_analyzed || 0) - Math.round((statsData.pass_rate || 0) * (statsData.total_analyzed || 0)),
        pass_rate: Math.round((statsData.pass_rate || 0) * 100),
        avg_compliance_score: Math.round(statsData.avg_compliance_score || 0)
      });

      // Load active script
      const scriptsRes = await fetch('/api/admin/post-close/scripts');
      const scriptsData = await scriptsRes.json();
      const active = scriptsData.scripts?.find((s: Script) => s.strict_mode !== undefined);
      setActiveScript(active || null);

      // Load recent checks
      const resultsRes = await fetch('/api/admin/post-close');
      const resultsData = await resultsRes.json();
      setRecentChecks((resultsData.results || []).slice(0, 5));

      // Load agent summaries
      const agentsRes = await fetch('/api/admin/post-close/agents');
      const agentsData = await agentsRes.json();
      const agents = agentsData.agents || [];
      const sorted = agents.sort((a: AgentSummary, b: AgentSummary) => b.pass_rate - a.pass_rate);
      setTopAgents(sorted.slice(0, 3));
      setBottomAgents(sorted.slice(-3).reverse());

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Compliance Dashboard</h1>
        <p className="text-gray-400 mt-1">Real-time post-close verification monitoring</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-gray-400">Total Analyzed</h3>
            <FileText className="w-5 h-5 text-cyan-500" />
          </div>
          <p className="text-3xl font-bold text-white">{stats?.total_analyzed || 0}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-gray-400">Pass Rate</h3>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-green-500">{stats?.pass_rate || 0}%</p>
          <p className="text-xs text-gray-500 mt-1">{stats?.total_passed || 0} passed</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-gray-400">Failed</h3>
            <TrendingDown className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-3xl font-bold text-red-500">{stats?.total_failed || 0}</p>
          <p className="text-xs text-gray-500 mt-1">{100 - (stats?.pass_rate || 0)}% failure rate</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm text-gray-400">Avg Score</h3>
            <Shield className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-white">{stats?.avg_compliance_score || 0}%</p>
        </div>
      </div>

      {/* Active Script Card */}
      {activeScript ? (
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-lg p-6 border border-cyan-500/20">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Shield className="w-6 h-6 text-cyan-500" />
                Active Script
              </h2>
              <p className="text-2xl font-bold text-cyan-400 mt-2">{activeScript.script_name}</p>
              <p className="text-sm text-gray-400 mt-1">Version: {activeScript.script_version}</p>
              <div className="flex items-center gap-4 mt-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  activeScript.strict_mode
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-green-500/20 text-green-400 border border-green-500/30'
                }`}>
                  {activeScript.strict_mode ? 'STRICT MODE (98%)' : 'FUZZY MODE (80%)'}
                </span>
                <span className="text-xs text-gray-500">
                  Updated: {new Date(activeScript.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <Link
              href="/compliance/scripts"
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Manage Scripts
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-500/10 rounded-lg p-6 border border-yellow-500/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-yellow-500" />
            <div>
              <h3 className="text-lg font-bold text-yellow-400">No Active Script</h3>
              <p className="text-sm text-gray-400 mt-1">Upload a post-close script to start analyzing calls</p>
            </div>
            <Link
              href="/compliance/scripts"
              className="ml-auto bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Upload Script
            </Link>
          </div>
        </div>
      )}

      {/* Recent Checks & Agents Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Compliance Checks */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Recent Checks</h2>
            <Link href="/compliance/results" className="text-sm text-cyan-400 hover:text-cyan-300">
              View All →
            </Link>
          </div>
          <div className="space-y-3">
            {recentChecks.length > 0 ? recentChecks.map((check) => (
              <div key={check.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-white">{check.agent_name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(check.analyzed_at).toLocaleTimeString()}
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
            )) : (
              <p className="text-center text-gray-500 py-8">No checks yet</p>
            )}
          </div>
        </div>

        {/* Agent Performance */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Agent Performance</h2>
            <Link href="/compliance/agents" className="text-sm text-cyan-400 hover:text-cyan-300">
              View All →
            </Link>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-green-400 mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                TOP PERFORMERS
              </h3>
              {topAgents.map((agent) => (
                <div key={agent.agent_name} className="flex items-center justify-between py-2">
                  <span className="text-sm text-white">{agent.agent_name}</span>
                  <span className="text-sm font-bold text-green-400">{Math.round(agent.pass_rate)}%</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-700 pt-3">
              <h3 className="text-xs font-bold text-red-400 mb-2 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                NEEDS IMPROVEMENT
              </h3>
              {bottomAgents.map((agent) => (
                <div key={agent.agent_name} className="flex items-center justify-between py-2">
                  <span className="text-sm text-white">{agent.agent_name}</span>
                  <span className="text-sm font-bold text-red-400">{Math.round(agent.pass_rate)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
