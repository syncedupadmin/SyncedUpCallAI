'use client';

import { useState, useEffect } from 'react';
import {
  Play,
  Upload,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  Download,
  Search,
  Activity,
  Plus,
  Settings,
  Loader2,
  FileText,
  Database,
  Rocket
} from 'lucide-react';

export default function TestingDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [suites, setSuites] = useState<any[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [testResults, setTestResults] = useState<any>(null);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [currentSuiteId, setCurrentSuiteId] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadMetrics();
    loadSuites();
    verifySystem();
  }, []);

  const loadMetrics = async () => {
    try {
      const res = await fetch('/api/testing/metrics');
      const data = await res.json();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  };

  const loadSuites = async () => {
    try {
      const res = await fetch('/api/testing/create-suite');
      const data = await res.json();
      if (data.suites && data.suites.length > 0) {
        setSuites(data.suites);
        if (!currentSuiteId && data.suites[0]) {
          setCurrentSuiteId(data.suites[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load suites:', error);
    }
  };

  const verifySystem = async () => {
    try {
      const res = await fetch('/api/testing/verify-system');
      const data = await res.json();
      setSystemStatus(data);
    } catch (error) {
      console.error('Failed to verify system:', error);
    }
  };

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleInitSystem = async () => {
    setLoading('init');
    try {
      const res = await fetch('/api/testing/verify-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init' })
      });
      const data = await res.json();
      if (data.success) {
        showMessage('success', 'System initialized successfully!');
        await verifySystem();
      } else {
        showMessage('error', data.message || 'Failed to initialize system');
      }
    } catch (error) {
      showMessage('error', 'Failed to initialize system');
    } finally {
      setLoading(null);
    }
  };

  const handleCreateSuite = async () => {
    setLoading('create-suite');
    try {
      const res = await fetch('/api/testing/create-suite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Test Suite ${new Date().toISOString().split('T')[0]}`,
          description: 'Automated test suite for transcription accuracy'
        })
      });
      const data = await res.json();
      if (data.suite) {
        showMessage('success', `Created suite: ${data.suite.name}`);
        setCurrentSuiteId(data.suite.id);
        await loadSuites();
      } else {
        showMessage('error', 'Failed to create suite');
      }
    } catch (error) {
      showMessage('error', 'Failed to create suite');
    } finally {
      setLoading(null);
    }
  };

  const handleImportBestCalls = async () => {
    setLoading('import');
    try {
      // First find good calls
      const findRes = await fetch('/api/testing/find-good-calls');
      const findData = await findRes.json();

      if (!findData.high_quality_calls || findData.high_quality_calls.length === 0) {
        showMessage('error', 'No high-quality calls found');
        return;
      }

      // Get or create suite
      let suiteId = currentSuiteId;
      if (!suiteId) {
        await handleCreateSuite();
        suiteId = currentSuiteId;
      }

      // Import top 5 calls
      const callIds = findData.high_quality_calls.slice(0, 5).map((c: any) => c.id);
      const importRes = await fetch('/api/testing/import-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suite_id: suiteId,
          call_ids: callIds
        })
      });

      const importData = await importRes.json();
      if (importData.imported) {
        showMessage('success', `Imported ${importData.imported} test cases`);
        await loadSuites();
      } else {
        showMessage('error', 'Failed to import calls');
      }
    } catch (error) {
      showMessage('error', 'Failed to import calls');
    } finally {
      setLoading(null);
    }
  };

  const handleQuickTest = async () => {
    setLoading('quick-test');
    try {
      // Find one good call
      const findRes = await fetch('/api/testing/find-good-calls');
      const findData = await findRes.json();

      if (!findData.high_quality_calls || findData.high_quality_calls.length === 0) {
        showMessage('error', 'No calls found for testing');
        return;
      }

      // Import just one call
      const call = findData.high_quality_calls[0];
      const importRes = await fetch('/api/testing/import-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_create_suite: true,
          call_ids: [call.id]
        })
      });

      const importData = await importRes.json();
      if (!importData.suite_id) {
        showMessage('error', 'Failed to import test call');
        return;
      }

      // Run the test
      const testRes = await fetch(`/api/testing/run/${importData.suite_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_all: true })
      });

      const result = await testRes.json();
      if (result.success) {
        setTestResults(result);
        showMessage('success', `Test complete! WER: ${result.results?.[0]?.wer || 'N/A'}%`);
        await loadMetrics();
      } else {
        showMessage('error', 'Test failed');
      }
    } catch (error) {
      showMessage('error', 'Quick test failed');
    } finally {
      setLoading(null);
    }
  };

  const handleRunAllTests = async () => {
    if (!currentSuiteId) {
      showMessage('error', 'No test suite selected. Create or import tests first.');
      return;
    }

    setLoading('run-all');
    try {
      const res = await fetch(`/api/testing/run/${currentSuiteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_all: true })
      });

      const result = await res.json();
      if (result.success) {
        setTestResults(result);
        showMessage('success', `Completed ${result.total_tests} tests. Passed: ${result.passed}, Failed: ${result.failed}`);
        await loadMetrics();
      } else {
        showMessage('error', result.error || 'Failed to run tests');
      }
    } catch (error) {
      showMessage('error', 'Failed to run tests');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Testing Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">Test and improve your transcription accuracy</p>
            </div>
            <button
              onClick={() => {
                loadMetrics();
                loadSuites();
                verifySystem();
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4 inline mr-2" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Alert Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
            message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
            'bg-blue-50 text-blue-800 border border-blue-200'
          }`}>
            <p className="flex items-center">
              {message.type === 'success' && <CheckCircle className="w-5 h-5 mr-2" />}
              {message.type === 'error' && <XCircle className="w-5 h-5 mr-2" />}
              {message.type === 'info' && <AlertCircle className="w-5 h-5 mr-2" />}
              {message.text}
            </p>
          </div>
        )}

        <div className="space-y-6">
          {/* System Status Card */}
          {systemStatus && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-lg font-semibold mb-4">System Status</h2>
              <div className="grid grid-cols-5 gap-4">
                <div className="text-center">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${
                    systemStatus.checks?.database?.status === 'success' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    <Database className={`w-6 h-6 ${
                      systemStatus.checks?.database?.status === 'success' ? 'text-green-600' : 'text-red-600'
                    }`} />
                  </div>
                  <p className="mt-2 text-sm font-medium">Database</p>
                  <p className="text-xs text-gray-500">
                    {systemStatus.checks?.database?.status || 'Unknown'}
                  </p>
                </div>
                <div className="text-center">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${
                    systemStatus.checks?.deepgram?.status === 'success' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    <Activity className={`w-6 h-6 ${
                      systemStatus.checks?.deepgram?.status === 'success' ? 'text-green-600' : 'text-red-600'
                    }`} />
                  </div>
                  <p className="mt-2 text-sm font-medium">Deepgram API</p>
                  <p className="text-xs text-gray-500">
                    {systemStatus.checks?.deepgram?.status || 'Unknown'}
                  </p>
                </div>
                <div className="text-center">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${
                    systemStatus.checks?.test_suites?.status === 'success' ? 'bg-green-100' :
                    systemStatus.checks?.test_suites?.status === 'warning' ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    <FileText className={`w-6 h-6 ${
                      systemStatus.checks?.test_suites?.status === 'success' ? 'text-green-600' :
                      systemStatus.checks?.test_suites?.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
                    }`} />
                  </div>
                  <p className="mt-2 text-sm font-medium">Test Suites</p>
                  <p className="text-xs text-gray-500">
                    {systemStatus.checks?.test_suites?.message || 'No suites'}
                  </p>
                </div>
                <div className="text-center">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${
                    systemStatus.checks?.test_cases?.status === 'success' ? 'bg-green-100' :
                    systemStatus.checks?.test_cases?.status === 'warning' ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    <FileText className={`w-6 h-6 ${
                      systemStatus.checks?.test_cases?.status === 'success' ? 'text-green-600' :
                      systemStatus.checks?.test_cases?.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
                    }`} />
                  </div>
                  <p className="mt-2 text-sm font-medium">Test Cases</p>
                  <p className="text-xs text-gray-500">
                    {systemStatus.checks?.test_cases?.data?.total || '0'} cases
                  </p>
                </div>
                <div className="text-center">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${
                    systemStatus.status === 'success' ? 'bg-green-100' :
                    systemStatus.status === 'warning' ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    <CheckCircle className={`w-6 h-6 ${
                      systemStatus.status === 'success' ? 'text-green-600' :
                      systemStatus.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
                    }`} />
                  </div>
                  <p className="mt-2 text-sm font-medium">Overall</p>
                  <p className="text-xs text-gray-500">
                    {systemStatus.ready ? 'Ready' : 'Not Ready'}
                  </p>
                </div>
              </div>
              {systemStatus.status === 'error' && (
                <div className="mt-4 pt-4 border-t">
                  <button
                    onClick={handleInitSystem}
                    disabled={loading === 'init'}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading === 'init' ? (
                      <><Loader2 className="w-4 h-4 inline mr-2 animate-spin" />Initializing...</>
                    ) : (
                      <>Initialize System</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick Start Guide */}
          {(!metrics || metrics.total_tests === 0) && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                🚀 Getting Started - Easy Setup
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Click the buttons below to set up your AI testing system. No console commands needed!
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <button
                  onClick={handleInitSystem}
                  disabled={loading === 'init'}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex flex-col items-center"
                >
                  {loading === 'init' ? (
                    <><Loader2 className="w-6 h-6 mb-2 animate-spin" />Initializing...</>
                  ) : (
                    <><Database className="w-6 h-6 mb-2" />Initialize System</>
                  )}
                </button>

                <button
                  onClick={handleCreateSuite}
                  disabled={loading === 'create-suite'}
                  className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex flex-col items-center"
                >
                  {loading === 'create-suite' ? (
                    <><Loader2 className="w-6 h-6 mb-2 animate-spin" />Creating...</>
                  ) : (
                    <><Plus className="w-6 h-6 mb-2" />Create Test Suite</>
                  )}
                </button>

                <button
                  onClick={handleImportBestCalls}
                  disabled={loading === 'import'}
                  className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex flex-col items-center"
                >
                  {loading === 'import' ? (
                    <><Loader2 className="w-6 h-6 mb-2 animate-spin" />Importing...</>
                  ) : (
                    <><Upload className="w-6 h-6 mb-2" />Import Best Calls</>
                  )}
                </button>

                <button
                  onClick={handleQuickTest}
                  disabled={loading === 'quick-test'}
                  className="px-4 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 flex flex-col items-center"
                >
                  {loading === 'quick-test' ? (
                    <><Loader2 className="w-6 h-6 mb-2 animate-spin" />Testing...</>
                  ) : (
                    <><Zap className="w-6 h-6 mb-2" />Quick Test (1 Call)</>
                  )}
                </button>

                <button
                  onClick={handleRunAllTests}
                  disabled={loading === 'run-all'}
                  className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex flex-col items-center"
                >
                  {loading === 'run-all' ? (
                    <><Loader2 className="w-6 h-6 mb-2 animate-spin" />Running...</>
                  ) : (
                    <><Play className="w-6 h-6 mb-2" />Run All Tests</>
                  )}
                </button>

                <button
                  onClick={() => {
                    loadMetrics();
                    loadSuites();
                    verifySystem();
                    showMessage('info', 'Data refreshed');
                  }}
                  className="px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex flex-col items-center"
                >
                  <RefreshCw className="w-6 h-6 mb-2" />
                  Refresh Data
                </button>
              </div>
            </div>
          )}

          {/* Key Metrics */}
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Average WER</h3>
                <p className="text-2xl font-bold text-gray-900">{metrics.wer_label || 'N/A'}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Tests Run</h3>
                <p className="text-2xl font-bold text-gray-900">{metrics.total_tests || 0}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Success Rate</h3>
                <p className="text-2xl font-bold text-gray-900">{metrics.success_rate || 'N/A'}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Avg Time</h3>
                <p className="text-2xl font-bold text-gray-900">
                  {metrics.avg_processing_time ? `${metrics.avg_processing_time}ms` : 'N/A'}
                </p>
              </div>
            </div>
          )}

          {/* Test Suites */}
          {suites.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold">Test Suites</h2>
              </div>
              <div className="divide-y">
                {suites.map((suite: any) => (
                  <div key={suite.id} className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{suite.name}</h3>
                      <p className="text-sm text-gray-500">
                        {suite.test_cases || 0} test cases
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setCurrentSuiteId(suite.id);
                        handleRunAllTests();
                      }}
                      disabled={loading === 'run-all'}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                    >
                      Run Tests
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test Results */}
          {testResults && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-lg font-semibold mb-4">Last Test Results</h2>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-sm text-gray-500">Total</p>
                  <p className="text-xl font-bold">{testResults.total_tests}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">Passed</p>
                  <p className="text-xl font-bold text-green-600">{testResults.passed}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">Failed</p>
                  <p className="text-xl font-bold text-red-600">{testResults.failed}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">Time</p>
                  <p className="text-xl font-bold">{(testResults.total_time_ms / 1000).toFixed(1)}s</p>
                </div>
              </div>
              {testResults.results && (
                <div className="space-y-2">
                  {testResults.results.map((result: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <span className="text-sm">{result.test_case_name}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm">WER: {result.wer?.toFixed(1)}%</span>
                        <span className={`text-sm font-medium ${
                          result.status === 'passed' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {result.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}