'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, TrendingUp, Phone, XCircle, Activity, Zap, Target, CheckCircle } from 'lucide-react';

interface DiscoveryMetrics {
  closeRate: number;
  pitchesDelivered: number;
  successfulCloses: number;
  openingScore: number;
  rebuttalFailures: number;
  hangupRate: number;
  earlyHangups: number;
  lyingDetected: number;
  agentMetrics: any[];
}

export default function DiscoveryTestPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedCalls, setProcessedCalls] = useState(0);
  const [selectedCount, setSelectedCount] = useState(10000);
  const [selectedAgents, setSelectedAgents] = useState('all');
  const [metrics, setMetrics] = useState<DiscoveryMetrics | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pullOptions = [
    { value: 100, label: '100 calls', time: '~5 minutes' },
    { value: 500, label: '500 calls', time: '~20 minutes' },
    { value: 1000, label: '1,000 calls', time: '~45 minutes' },
    { value: 5000, label: '5,000 calls', time: '~3 hours' },
    { value: 10000, label: '10,000 calls', time: '~6 hours' }
  ];

  const startDiscovery = async () => {
    setIsRunning(true);
    setError(null);
    setProgress(0);
    setProcessedCalls(0);
    setInsights([]);

    try {
      // Use test endpoint for now (analyzes existing DB calls)
      const response = await fetch('/api/admin/discovery/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callCount: selectedCount
        })
      });

      if (!response.ok) throw new Error('Failed to start discovery');

      const result = await response.json();

      // Update UI with results
      setMetrics(result.metrics);
      setInsights(result.insights);
      setProgress(100);
      setProcessedCalls(selectedCount);
      setIsRunning(false);

    } catch (err: any) {
      setError(err.message);
      setIsRunning(false);
    }
  };

  const pollProgress = async (sessionId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/discovery/progress?sessionId=${sessionId}`);
        const data = await response.json();

        setProgress(data.progress);
        setProcessedCalls(data.processed);

        // Add new insights as they emerge
        if (data.newInsights) {
          setInsights(prev => [...prev, ...data.newInsights]);
        }

        // Update metrics progressively
        if (data.metrics) {
          setMetrics(data.metrics);
        }

        if (data.complete) {
          clearInterval(interval);
          setIsRunning(false);
        }
      } catch (err) {
        console.error('Progress polling error:', err);
      }
    }, 2000); // Poll every 2 seconds
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Discovery System Test</h1>
          <p className="text-gray-400">Analyze call patterns and create performance baselines</p>
        </div>

        {/* Hero Metric - Closing Rate */}
        {metrics && (
          <div className="bg-gradient-to-r from-green-900/50 to-emerald-900/50 rounded-xl p-8 mb-8 border border-green-800">
            <div className="text-center">
              <div className="text-7xl font-bold text-white mb-2">
                {(metrics?.closeRate || 0).toFixed(1)}%
              </div>
              <div className="text-xl text-green-100">Closing Rate</div>
              <div className="text-sm text-green-200 mt-4">
                {metrics.pitchesDelivered} pitches delivered → {metrics.successfulCloses} successful closes
              </div>
            </div>
          </div>
        )}

        {/* Key Metrics Row */}
        {metrics && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {/* Opening Score */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-blue-400" />
                  <span className="text-sm text-gray-400">Opening Score</span>
                </div>
              </div>
              <div className="text-3xl font-bold text-white">{metrics.openingScore}/100</div>
              <div className="text-xs text-gray-500 mt-2">
                Quality of agent openings
              </div>
            </div>

            {/* Rebuttal Failures */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-yellow-400" />
                  <span className="text-sm text-gray-400">Giving Up (No Rebuttals)</span>
                </div>
              </div>
              <div className="text-3xl font-bold text-white">{metrics.rebuttalFailures}</div>
              <div className="text-xs text-gray-500 mt-2">
                Calls where agents didn't attempt rebuttals
              </div>
            </div>

            {/* Hangup Detection */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <span className="text-sm text-gray-400">Agent Hangups</span>
                </div>
              </div>
              <div className="text-3xl font-bold text-white">{metrics.earlyHangups}</div>
              <div className="text-xs text-gray-500 mt-2">
                Agents hanging up on "Hello" ({(metrics?.hangupRate || 0).toFixed(1)}% of calls)
              </div>
            </div>
          </div>
        )}

        {/* Configuration Panel */}
        {!isRunning && !metrics && (
          <div className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-800">
            <h2 className="text-xl font-bold mb-6">Discovery Configuration</h2>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Number of Calls to Analyze</label>
                <select
                  value={selectedCount}
                  onChange={(e) => setSelectedCount(Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                >
                  {pullOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label} ({option.time})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Agent Selection</label>
                <select
                  value={selectedAgents}
                  onChange={(e) => setSelectedAgents(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                >
                  <option value="all">All Agents</option>
                  <option value="select">Select Specific Agents...</option>
                </select>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Include all call durations (catches 5-second hangups)</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Detect lying patterns (dental exam scams)</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Analyze opening effectiveness</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>Track rebuttal usage</span>
              </div>
            </div>

            <button
              onClick={startDiscovery}
              className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Start Discovery Analysis
            </button>
          </div>
        )}

        {/* Progress Panel */}
        {isRunning && (
          <div className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-800">
            <h2 className="text-xl font-bold mb-6">Discovery in Progress</h2>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span>{processedCalls} / {selectedCount} calls processed</span>
                <span>{(progress || 0).toFixed(1)}%</span>
              </div>
              <div className="bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Emerging Insights */}
            {insights.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Emerging Insights</h3>
                {insights.slice(-5).map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <Zap className="w-4 h-4 text-yellow-400 mt-0.5" />
                    <span className="text-gray-300">{insight}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lying Detection Alert */}
        {metrics && metrics.lyingDetected > 0 && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-6 mb-8">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-400 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-red-300 mb-2">
                  Deception Patterns Detected
                </h3>
                <p className="text-sm text-gray-300 mb-3">
                  Found {metrics.lyingDetected} instances of potential deception:
                </p>
                <ul className="space-y-1 text-sm text-gray-400">
                  <li>• "Free dental exams" that aren't actually free</li>
                  <li>• "Cleanings covered" when they require paid membership</li>
                  <li>• "Bite wing x-rays included" with hidden costs</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-8">
            <div className="flex items-center gap-2 text-red-300">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}