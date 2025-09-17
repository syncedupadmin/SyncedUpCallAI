'use client';

import { useState, useEffect } from 'react';
import {
  Mic,
  TrendingUp,
  Activity,
  AlertCircle,
  CheckCircle,
  Play,
  BarChart3,
  Zap,
  Target,
  Brain
} from 'lucide-react';

interface OpeningSegment {
  id: string;
  transcript: string;
  pace_wpm: number;
  silence_ratio: number;
  call_continued: boolean;
  disposition: string;
  duration_sec: number;
  success_score: number;
  engagement_score: number;
  agent_name: string;
  created_at: string;
}

interface OpeningPattern {
  id: string;
  pattern_name: string;
  example_transcript: string;
  key_phrases: string[];
  success_rate: number;
  sample_count: number;
  avg_duration_sec: number;
  conversion_rate: number;
}

interface AgentPerformance {
  agent_name: string;
  total_calls: number;
  avg_success_score: number;
  avg_engagement_score: number;
  continuation_rate: number;
  conversion_rate: number;
}

export default function OpeningsPage() {
  const [openings, setOpenings] = useState<OpeningSegment[]>([]);
  const [patterns, setPatterns] = useState<OpeningPattern[]>([]);
  const [agents, setAgents] = useState<AgentPerformance[]>([]);
  const [processing, setProcessing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [stats, setStats] = useState<any>({});
  const [selectedOpening, setSelectedOpening] = useState<OpeningSegment | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'patterns' | 'agents' | 'test'>('overview');

  useEffect(() => {
    loadOpenings();
    loadPatterns();
    loadStats();
    loadAgents();
  }, []);

  const loadOpenings = async () => {
    try {
      const res = await fetch('/api/admin/openings');
      const data = await res.json();
      if (data.openings) {
        setOpenings(data.openings);
      }
    } catch (error) {
      console.error('Failed to load openings:', error);
    }
  };

  const loadPatterns = async () => {
    try {
      const res = await fetch('/api/admin/openings/patterns');
      const data = await res.json();
      if (data.patterns) {
        setPatterns(data.patterns);
      }
    } catch (error) {
      console.error('Failed to load patterns:', error);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch('/api/admin/openings/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/admin/openings/agents');
      const data = await res.json();
      if (data.agents) {
        setAgents(data.agents);
      }
    } catch (error) {
      console.error('Failed to load agent performance:', error);
    }
  };

  const extractFromRecentCalls = async () => {
    setProcessing(true);
    try {
      const res = await fetch('/api/admin/openings/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 })
      });
      const result = await res.json();

      alert(`Successfully extracted ${result.extracted} openings from your calls`);

      // Reload data
      await Promise.all([loadOpenings(), loadStats()]);
    } catch (error) {
      console.error('Extraction failed:', error);
      alert('Failed to extract openings');
    } finally {
      setProcessing(false);
    }
  };

  const discoverPatterns = async () => {
    setDiscovering(true);
    try {
      const res = await fetch('/api/admin/openings/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await res.json();

      alert(`Discovered ${result.patterns?.length || 0} successful patterns from your calls`);

      // Reload patterns
      await loadPatterns();
    } catch (error) {
      console.error('Discovery failed:', error);
      alert('Failed to discover patterns');
    } finally {
      setDiscovering(false);
    }
  };

  const formatPercentage = (value: number): string => {
    if (!value || isNaN(value)) return '0%';
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatNumber = (value: number): string => {
    if (!value || isNaN(value)) return '0';
    return value.toFixed(1);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <Mic className="w-10 h-10 text-blue-500" />
            Opening Analysis System
          </h1>
          <p className="text-gray-400">Analyze and optimize call openings using AI trained on YOUR successful calls</p>
        </div>

        {/* Hero Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-br from-green-900/50 to-emerald-900/50 rounded-xl p-6 border border-green-800">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-6 h-6 text-green-400" />
              <span className="text-xs text-green-400">Success Rate</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {formatPercentage(stats.overall_success_rate)}
            </div>
            <div className="text-xs text-gray-400 mt-1">Opening continuation rate</div>
          </div>

          <div className="bg-gradient-to-br from-blue-900/50 to-indigo-900/50 rounded-xl p-6 border border-blue-800">
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-6 h-6 text-blue-400" />
              <span className="text-xs text-blue-400">Avg Engagement</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {formatNumber(stats.avg_engagement_score || 0)}
            </div>
            <div className="text-xs text-gray-400 mt-1">Engagement score (0-1)</div>
          </div>

          <div className="bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-xl p-6 border border-purple-800">
            <div className="flex items-center justify-between mb-2">
              <Brain className="w-6 h-6 text-purple-400" />
              <span className="text-xs text-purple-400">Patterns Found</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {patterns.length}
            </div>
            <div className="text-xs text-gray-400 mt-1">Successful patterns</div>
          </div>

          <div className="bg-gradient-to-br from-orange-900/50 to-red-900/50 rounded-xl p-6 border border-orange-800">
            <div className="flex items-center justify-between mb-2">
              <Target className="w-6 h-6 text-orange-400" />
              <span className="text-xs text-orange-400">Conversion</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {formatPercentage(stats.conversion_rate)}
            </div>
            <div className="text-xs text-gray-400 mt-1">Sales/Appointments</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={extractFromRecentCalls}
            disabled={processing}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'Extract Openings from Recent Calls'}
          </button>

          <button
            onClick={discoverPatterns}
            disabled={discovering}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
          >
            {discovering ? 'Discovering...' : 'Discover Successful Patterns'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900 rounded-lg p-1">
          {['overview', 'patterns', 'agents', 'test'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`flex-1 px-4 py-2 rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Recent Openings */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Play className="w-5 h-5 text-blue-400" />
                Recent Opening Analysis
              </h2>

              <div className="space-y-4">
                {openings.slice(0, 5).map((opening) => (
                  <div
                    key={opening.id}
                    className="bg-gray-800/50 rounded-lg p-4 cursor-pointer hover:bg-gray-800 transition-colors"
                    onClick={() => setSelectedOpening(opening)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <p className="text-sm text-gray-300 line-clamp-2">
                          "{opening.transcript}"
                        </p>
                      </div>
                      <div className="ml-4">
                        {opening.call_continued ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                    </div>

                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>Agent: {opening.agent_name}</span>
                      <span>Pace: {opening.pace_wpm?.toFixed(0)} wpm</span>
                      <span>Score: {formatPercentage(opening.success_score)}</span>
                      <span className={`font-bold ${
                        opening.disposition === 'SALE' ? 'text-green-500' :
                        opening.disposition === 'APPOINTMENT_SET' ? 'text-blue-500' :
                        'text-gray-500'
                      }`}>
                        {opening.disposition}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {openings.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No openings analyzed yet. Click "Extract Openings from Recent Calls" to start.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'patterns' && (
          <div className="space-y-6">
            {/* Discovered Patterns */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                Top Performing Patterns
              </h2>

              {patterns.length > 0 ? (
                <div className="space-y-4">
                  {patterns.map((pattern) => (
                    <div key={pattern.id} className="bg-gray-800/50 rounded-lg p-4">
                      <div className="mb-3">
                        <p className="text-sm text-gray-300 italic">
                          "{pattern.example_transcript}"
                        </p>
                      </div>

                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Success Rate:</span>
                          <span className="ml-2 text-green-400 font-bold">
                            {formatPercentage(pattern.success_rate)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Sample Size:</span>
                          <span className="ml-2 text-white">
                            {pattern.sample_count} calls
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Avg Duration:</span>
                          <span className="ml-2 text-white">
                            {Math.round(pattern.avg_duration_sec)}s
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Conversion:</span>
                          <span className="ml-2 text-blue-400 font-bold">
                            {formatPercentage(pattern.conversion_rate)}
                          </span>
                        </div>
                      </div>

                      {pattern.key_phrases && pattern.key_phrases.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {pattern.key_phrases.map((phrase, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-blue-900/30 text-blue-400 text-xs rounded"
                            >
                              {phrase}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No patterns discovered yet. Click "Discover Successful Patterns" to analyze your calls.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="space-y-6">
            {/* Agent Performance */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Agent Opening Performance
              </h2>

              {agents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                        <th className="pb-3">Agent</th>
                        <th className="pb-3">Total Calls</th>
                        <th className="pb-3">Success Score</th>
                        <th className="pb-3">Engagement</th>
                        <th className="pb-3">Continuation</th>
                        <th className="pb-3">Conversion</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {agents.map((agent) => (
                        <tr key={agent.agent_name} className="border-b border-gray-800/50">
                          <td className="py-3 font-medium">{agent.agent_name}</td>
                          <td className="py-3">{agent.total_calls}</td>
                          <td className="py-3">
                            <span className={`font-bold ${
                              agent.avg_success_score > 0.7 ? 'text-green-500' :
                              agent.avg_success_score > 0.5 ? 'text-yellow-500' :
                              'text-red-500'
                            }`}>
                              {formatNumber(agent.avg_success_score)}
                            </span>
                          </td>
                          <td className="py-3">{formatNumber(agent.avg_engagement_score)}</td>
                          <td className="py-3">{formatPercentage(agent.continuation_rate)}</td>
                          <td className="py-3">
                            <span className={`font-bold ${
                              agent.conversion_rate > 0.05 ? 'text-green-500' :
                              agent.conversion_rate > 0.02 ? 'text-yellow-500' :
                              'text-red-500'
                            }`}>
                              {formatPercentage(agent.conversion_rate)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No agent performance data available. Extract openings to see agent metrics.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'test' && (
          <div className="space-y-6">
            {/* Test Opening */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4">Test Opening Score</h2>
              <textarea
                className="w-full bg-gray-800 text-white p-4 rounded-lg border border-gray-700"
                rows={4}
                placeholder="Paste an opening transcript here to get instant scoring..."
                onBlur={async (e) => {
                  if (e.target.value) {
                    const res = await fetch('/api/admin/openings/score', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ transcript: e.target.value })
                    });
                    const result = await res.json();
                    alert(`Score: ${result.score}\nContinuation Probability: ${formatPercentage(result.continuationProbability)}\nRecommendation: ${result.recommendations?.[0] || 'N/A'}`);
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Selected Opening Detail Modal */}
        {selectedOpening && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedOpening(null)}
          >
            <div
              className="bg-gray-900 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold mb-4">Opening Analysis Detail</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-500">Transcript</label>
                  <p className="text-gray-300 mt-1">"{selectedOpening.transcript}"</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Agent</label>
                    <p className="text-white">{selectedOpening.agent_name}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Disposition</label>
                    <p className="text-white">{selectedOpening.disposition}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Duration</label>
                    <p className="text-white">{selectedOpening.duration_sec}s</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Continued?</label>
                    <p className="text-white">{selectedOpening.call_continued ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Pace</label>
                    <p className="text-white">{selectedOpening.pace_wpm?.toFixed(0)} wpm</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Silence Ratio</label>
                    <p className="text-white">{formatPercentage(selectedOpening.silence_ratio)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Success Score</label>
                    <p className="text-white">{formatPercentage(selectedOpening.success_score)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Engagement Score</label>
                    <p className="text-white">{formatNumber(selectedOpening.engagement_score)}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedOpening(null)}
                className="mt-6 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}