'use client';

import { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { toast } from 'react-hot-toast';
import {
  PlayCircle,
  PauseCircle,
  Upload,
  RefreshCw,
  BarChart3,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileAudio,
  Activity,
  TrendingUp,
  TrendingDown,
  HelpCircle,
  ArrowRight,
  Zap
} from 'lucide-react';
import ConvosoImporter from '@/components/testing/ConvosoImporter';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function TestingDashboard() {
  const [selectedSuite, setSelectedSuite] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'tests' | 'metrics' | 'feedback'>('overview');

  // Fetch test suites
  const { data: suitesData, error: suitesError } = useSWR('/api/testing/suites', fetcher);

  // Fetch metrics
  const { data: metricsData } = useSWR('/api/testing/metrics?days=7', fetcher, {
    refreshInterval: 30000 // Refresh every 30 seconds
  });

  // Fetch feedback summary
  const { data: feedbackData } = useSWR('/api/testing/feedback?days=7', fetcher);

  // Fetch monitor data (transcription queue status)
  const { data: monitorData } = useSWR('/api/testing/monitor', fetcher, {
    refreshInterval: 5000 // Refresh every 5 seconds to see queue updates
  });

  const runTestSuite = async (suiteId: string) => {
    setIsRunning(true);
    try {
      const response = await fetch(`/api/testing/run/${suiteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parallel: 5,
          stopOnFailure: false
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Test suite "${result.suite_name}" started!`);
        // Start monitoring the test progress
        monitorTestProgress(result.suite_run_id);
      } else {
        toast.error(result.error || 'Failed to start test suite');
      }
    } catch (error: any) {
      toast.error('Failed to start test suite');
      console.error(error);
    } finally {
      setIsRunning(false);
    }
  };

  const monitorTestProgress = (suiteRunId: string) => {
    // Set up SSE connection to monitor progress
    const eventSource = new EventSource(`/api/testing/stream/${suiteRunId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.status === 'completed') {
        toast.success('Test suite completed!');
        mutate('/api/testing/metrics?days=7');
        eventSource.close();
      } else if (data.status === 'failed') {
        toast.error('Test suite failed');
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Testing Dashboard</h1>
              <p className="text-sm text-gray-900 mt-1">Test and improve your transcription & analysis accuracy</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => mutate('/api/testing/metrics?days=7')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <RefreshCw className="w-4 h-4 inline mr-2" />
                Refresh
              </button>
              <button
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Upload className="w-4 h-4 inline mr-2" />
                Upload Test Audio
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-8 border-t -mb-px">
            {['overview', 'tests', 'metrics', 'feedback'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-900 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Getting Started Guide */}
            {(!metricsData?.metrics?.overall?.total_tests || metricsData.metrics.overall.total_tests === 0) && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 p-2 bg-blue-100 rounded-lg">
                    <HelpCircle className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      🚀 Getting Started with AI Testing
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">1</span>
                        <div>
                          <p className="font-medium text-gray-900">Import Test Calls</p>
                          <p className="text-sm text-gray-600 mt-1">
                            Use high-quality calls from your system as test cases. Open browser console (F12) and run:
                          </p>
                          <pre className="mt-2 p-2 bg-gray-900 text-green-400 text-xs rounded overflow-x-auto">
{`fetch('/api/testing/find-good-calls').then(r => r.json()).then(console.log)`}
                          </pre>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">2</span>
                        <div>
                          <p className="font-medium text-gray-900">Run Your First Test</p>
                          <p className="text-sm text-gray-600 mt-1">
                            Click "Run Suite" below or run this in console:
                          </p>
                          <pre className="mt-2 p-2 bg-gray-900 text-green-400 text-xs rounded overflow-x-auto">
{`fetch('/api/testing/run/876b6b65-ddaa-42fe-aecd-80457cb66035', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({parallel: 1})
}).then(r => r.json()).then(console.log)`}
                          </pre>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <span className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">3</span>
                        <div>
                          <p className="font-medium text-gray-900">Review Results</p>
                          <p className="text-sm text-gray-600 mt-1">
                            Tests run through YOUR Deepgram/AssemblyAI pipeline. Check accuracy (WER), provide feedback, and track improvements over time.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm">
                        <strong className="text-yellow-800">💡 Pro Tip:</strong>
                        <span className="text-yellow-700 ml-1">
                          Start with your highest QA score calls as baseline tests. If these fail, you know there's a real accuracy issue.
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Transcription Queue Status */}
            {monitorData?.metrics?.transcription_queue && (
              <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-600" />
                    Transcription Queue Status
                  </h3>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {monitorData.metrics.transcription_queue.pending || 0}
                    </div>
                    <div className="text-sm text-gray-600">Pending</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {monitorData.metrics.transcription_queue.processing || 0}
                    </div>
                    <div className="text-sm text-gray-600">Processing</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {monitorData.metrics.transcription_queue.completed || 0}
                    </div>
                    <div className="text-sm text-gray-600">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {monitorData.metrics.transcription_queue.failed || 0}
                    </div>
                    <div className="text-sm text-gray-600">Failed</div>
                  </div>
                </div>
                {monitorData.metrics.transcription_queue.avg_completion_minutes && (
                  <div className="mt-3 pt-3 border-t text-sm text-gray-600">
                    Average completion time: {Math.round(monitorData.metrics.transcription_queue.avg_completion_minutes)} minutes
                  </div>
                )}
              </div>
            )}

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <MetricCard
                title="Average WER"
                value={metricsData?.metrics?.overall?.avg_wer
                  ? `${(metricsData.metrics.overall.avg_wer * 100).toFixed(1)}%`
                  : 'N/A'
                }
                trend={metricsData?.metrics?.cost_analysis?.improvement_percentage}
                icon={<BarChart3 className="w-5 h-5" />}
                color="blue"
              />
              <MetricCard
                title="Tests Run"
                value={metricsData?.metrics?.overall?.total_tests || 0}
                subtitle="Last 7 days"
                icon={<Activity className="w-5 h-5" />}
                color="green"
              />
              <MetricCard
                title="Success Rate"
                value={metricsData?.metrics?.overall?.total_tests
                  ? `${((metricsData.metrics.overall.successful_tests / metricsData.metrics.overall.total_tests) * 100).toFixed(0)}%`
                  : 'N/A'
                }
                icon={<CheckCircle className="w-5 h-5" />}
                color="emerald"
              />
              <MetricCard
                title="Avg Time"
                value={metricsData?.metrics?.overall?.avg_execution_time_ms
                  ? `${(metricsData.metrics.overall.avg_execution_time_ms / 1000).toFixed(1)}s`
                  : 'N/A'
                }
                icon={<RefreshCw className="w-5 h-5" />}
                color="purple"
              />
            </div>

            {/* Quick Actions Bar */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Actions</h3>
              <div className="flex gap-3 flex-wrap">
                <ConvosoImporter
                  suiteId="876b6b65-ddaa-42fe-aecd-80457cb66035"
                  onImport={() => {
                    mutate('/api/testing/suites');
                    mutate('/api/testing/metrics?days=7');
                  }}
                />

                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/testing/find-good-calls');
                      const data = await res.json();
                      if (data.high_quality_calls && data.high_quality_calls.length > 0) {
                        const call = data.high_quality_calls[0];
                        const importRes = await fetch(`/api/testing/import-call/${call.id}`, {
                          method: 'POST',
                          headers: {'Content-Type': 'application/json'},
                          body: JSON.stringify({
                            suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',
                            verify_transcript: true
                          })
                        });
                        const importData = await importRes.json();
                        if (importData.success) {
                          toast.success(`Imported call ${call.id} (QA Score: ${call.qa_score})`);
                          mutate('/api/testing/suites');
                        } else {
                          toast.error(importData.error || 'Failed to import call');
                        }
                      } else {
                        toast.error('No suitable calls found to import');
                      }
                    } catch (error) {
                      toast.error('Failed to import test call');
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm font-medium"
                >
                  <Upload className="w-4 h-4" />
                  Import Best Call
                </button>

                <button
                  onClick={() => runTestSuite('876b6b65-ddaa-42fe-aecd-80457cb66035')}
                  disabled={isRunning}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
                >
                  <Zap className="w-4 h-4" />
                  Quick Test Run
                </button>

                <button
                  onClick={async () => {
                    const res = await fetch('/api/testing/verify-setup');
                    const data = await res.json();
                    if (data.success) {
                      toast.success('System verified and ready!');
                      console.log('System Status:', data);
                    } else {
                      toast.error('System check failed');
                    }
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 text-sm font-medium"
                >
                  <CheckCircle className="w-4 h-4" />
                  Verify System
                </button>

                <button
                  onClick={() => {
                    const commands = [
                      "// Import a call:",
                      "fetch('/api/testing/import-call/CALL_ID', {",
                      "  method: 'POST',",
                      "  headers: {'Content-Type': 'application/json'},",
                      "  body: JSON.stringify({",
                      "    suite_id: '876b6b65-ddaa-42fe-aecd-80457cb66035',",
                      "    verify_transcript: true",
                      "  })",
                      "}).then(r => r.json()).then(console.log)",
                      "",
                      "// Run tests:",
                      "fetch('/api/testing/run/876b6b65-ddaa-42fe-aecd-80457cb66035', {",
                      "  method: 'POST',",
                      "  headers: {'Content-Type': 'application/json'},",
                      "  body: JSON.stringify({parallel: 3})",
                      "}).then(r => r.json()).then(console.log)"
                    ].join('\n');
                    console.log(commands);
                    toast.success('Commands printed to console!');
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2 text-sm font-medium"
                >
                  <HelpCircle className="w-4 h-4" />
                  Show Commands
                </button>
              </div>
            </div>

            {/* Test Suites */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Test Suites</h2>
              </div>
              <div className="divide-y">
                {suitesData?.suites?.map((suite: any) => (
                  <div key={suite.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-gray-900">{suite.name}</h3>
                      <p className="text-sm text-gray-900 mt-1">{suite.description}</p>
                      <div className="flex gap-4 mt-2">
                        <span className="text-xs text-gray-900">
                          {suite.test_case_count} tests
                        </span>
                        <span className="text-xs text-gray-900">
                          {suite.total_runs} runs
                        </span>
                        {suite.avg_wer_all_runs && (
                          <span className="text-xs text-gray-900">
                            Avg WER: {(suite.avg_wer_all_runs * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => runTestSuite(suite.id)}
                      disabled={isRunning}
                      className="ml-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <PlayCircle className="w-4 h-4 inline mr-2" />
                      Run Suite
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {metricsData?.recommendations && metricsData.recommendations.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b">
                  <h2 className="text-lg font-semibold">Recommendations</h2>
                </div>
                <div className="px-6 py-4">
                  <ul className="space-y-3">
                    {metricsData.recommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="flex items-start">
                        <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 mr-3 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tests' && (
          <TestResultsView />
        )}

        {activeTab === 'metrics' && (
          <MetricsView metricsData={metricsData} />
        )}

        {activeTab === 'feedback' && (
          <FeedbackView feedbackData={feedbackData} />
        )}
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  color
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div className={`p-2 bg-${color}-100 rounded-lg`}>
          <div className={`text-${color}-600`}>{icon}</div>
        </div>
        {trend !== undefined && (
          <div className="flex items-center text-sm">
            {trend > 0 ? (
              <>
                <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                <span className="text-green-600">+{trend.toFixed(1)}%</span>
              </>
            ) : (
              <>
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                <span className="text-red-600">{trend.toFixed(1)}%</span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
        {subtitle && (
          <p className="text-sm text-gray-900 mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// Test Results View Component
function TestResultsView() {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b">
        <h2 className="text-lg font-semibold">Recent Test Results</h2>
      </div>
      <div className="px-6 py-4">
        <p className="text-sm text-gray-900">Test results will appear here when tests are run</p>
      </div>
    </div>
  );
}

// Metrics View Component
function MetricsView({ metricsData }: any) {
  return (
    <div className="space-y-6">
      {/* Category Performance */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Performance by Category</h2>
        </div>
        <div className="px-6 py-4">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                    Tests
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                    Avg WER
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                    Quality Distribution
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {metricsData?.metrics?.by_category?.map((cat: any) => (
                  <tr key={cat.test_category}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {cat.test_category}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {cat.test_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(cat.avg_wer * 100).toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-1">
                        <div className="bg-green-500 h-4" style={{ width: `${(cat.excellent_count / cat.test_count) * 100}px` }} />
                        <div className="bg-yellow-500 h-4" style={{ width: `${(cat.good_count / cat.test_count) * 100}px` }} />
                        <div className="bg-orange-500 h-4" style={{ width: `${(cat.fair_count / cat.test_count) * 100}px` }} />
                        <div className="bg-red-500 h-4" style={{ width: `${(cat.poor_count / cat.test_count) * 100}px` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Engine Comparison */}
      {metricsData?.metrics?.engine_comparison?.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold">Engine Comparison</h2>
          </div>
          <div className="px-6 py-4">
            <div className="space-y-4">
              {metricsData.metrics.engine_comparison.map((engine: any) => (
                <div key={engine.engine} className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900">{engine.engine}</h3>
                    <div className="flex gap-4 mt-1">
                      <span className="text-xs text-gray-900">
                        WER: {(engine.avg_wer * 100).toFixed(1)}%
                      </span>
                      <span className="text-xs text-gray-900">
                        Speed: {engine.avg_time_ms}ms
                      </span>
                      <span className="text-xs text-gray-900">
                        Cost: ${engine.total_cost_dollars?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      {engine.test_count} tests
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Feedback View Component
function FeedbackView({ feedbackData }: any) {
  return (
    <div className="space-y-6">
      {/* Feedback Summary */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Feedback Summary</h2>
        </div>
        <div className="px-6 py-4">
          {feedbackData?.summary?.length > 0 ? (
            <div className="space-y-3">
              {feedbackData.summary.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      {item.error_category || 'Uncategorized'}
                    </span>
                    {item.error_severity && (
                      <span className="ml-2 text-xs text-gray-900">
                        ({item.error_severity})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      <span className="flex items-center text-sm">
                        <ThumbsUp className="w-4 h-4 text-green-500 mr-1" />
                        {item.thumbs_up}
                      </span>
                      <span className="flex items-center text-sm">
                        <ThumbsDown className="w-4 h-4 text-red-500 mr-1" />
                        {item.thumbs_down}
                      </span>
                    </div>
                    <span className="text-sm text-gray-900">
                      {item.count} occurrences
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-900">No feedback data available</p>
          )}
        </div>
      </div>

      {/* Correction Statistics */}
      {feedbackData?.correction_stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard
            title="Total Corrections"
            value={feedbackData.correction_stats.total_corrections}
            icon={<CheckCircle className="w-5 h-5" />}
            color="blue"
          />
          <MetricCard
            title="Verified"
            value={feedbackData.correction_stats.verified_corrections}
            icon={<CheckCircle className="w-5 h-5" />}
            color="green"
          />
          <MetricCard
            title="Used in Training"
            value={feedbackData.correction_stats.used_in_training}
            icon={<Activity className="w-5 h-5" />}
            color="purple"
          />
          <MetricCard
            title="Engines Covered"
            value={feedbackData.correction_stats.engines_covered}
            icon={<BarChart3 className="w-5 h-5" />}
            color="orange"
          />
        </div>
      )}
    </div>
  );
}