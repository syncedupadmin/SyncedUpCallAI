'use client';

import { useState, useEffect } from 'react';

interface SystemStatus {
  status: 'operational' | 'degraded' | 'outage';
  timestamp: string;
  uptime: {
    seconds: number;
    formatted: string;
  };
  services: {
    database: {
      status: string;
      latency_ms?: number;
      connections: {
        active: number;
        idle: number;
        total: number;
      };
    };
    queues: {
      recordings: {
        pending: number;
        processing: number;
        failed: number;
        stale: number;
      };
      transcriptions: {
        pending: number;
        processing: number;
        completed_today: number;
      };
    };
    external_apis: {
      deepgram: string;
      openai: string;
      convoso: string;
    };
  };
  performance: {
    avg_response_time_ms: number;
    requests_per_minute: number;
    error_rate: number;
  };
  issues: Array<{
    type: 'error' | 'warning' | 'info';
    message: string;
  }>;
  recent_activity: {
    calls_processed_last_hour: number;
    recordings_fetched_last_hour: number;
    transcriptions_completed_last_hour: number;
    analyses_completed_last_hour: number;
  };
}

export default function OperationsDashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/status');
      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }

      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    if (autoRefresh) {
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
      case 'healthy':
        return '#10b981';
      case 'degraded':
        return '#f59e0b';
      case 'outage':
      case 'unhealthy':
      case 'down':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational':
      case 'healthy':
        return '✓';
      case 'degraded':
        return '⚠';
      case 'outage':
      case 'unhealthy':
      case 'down':
        return '✗';
      default:
        return '?';
    }
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Loading operational status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Operations Dashboard</h1>
        <div className="flex gap-4">
          <button
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            onClick={fetchData}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          Error: {error}
        </div>
      )}

      {status && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500 mb-2">System Status</h3>
              <div className="flex items-center justify-between">
                <span
                  className="px-3 py-1 rounded-full text-white text-sm font-medium"
                  style={{ backgroundColor: getStatusColor(status.status) }}
                >
                  {getStatusIcon(status.status)} {status.status}
                </span>
                <span className="text-sm text-gray-500">
                  Up: {status.uptime.formatted}
                </span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Database</h3>
              <div className="flex items-center justify-between">
                <span
                  className="px-3 py-1 rounded-full text-white text-sm font-medium"
                  style={{ backgroundColor: getStatusColor(status.services.database.status) }}
                >
                  {getStatusIcon(status.services.database.status)} {status.services.database.status}
                </span>
                <span className="text-sm text-gray-500">
                  {status.services.database.latency_ms}ms
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Connections: {status.services.database.connections.active}/{status.services.database.connections.total}
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Performance</h3>
              <div className="space-y-1">
                <div className="text-sm">
                  Response: {status.performance.avg_response_time_ms.toFixed(0)}ms
                </div>
                <div className="text-xs text-gray-500">
                  {status.performance.requests_per_minute.toFixed(1)} req/min
                </div>
                {status.performance.error_rate > 0.01 && (
                  <div className="text-xs text-red-500">
                    Error rate: {(status.performance.error_rate * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          </div>

          {status.issues.length > 0 && (
            <div className="bg-white p-4 rounded-lg shadow mb-6">
              <h3 className="text-lg font-medium mb-3">Active Issues</h3>
              <div className="space-y-2">
                {status.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded ${
                      issue.type === 'error'
                        ? 'bg-red-50 border border-red-200 text-red-700'
                        : issue.type === 'warning'
                        ? 'bg-yellow-50 border border-yellow-200 text-yellow-700'
                        : 'bg-blue-50 border border-blue-200 text-blue-700'
                    }`}
                  >
                    {issue.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">Service Health</h3>
              <div className="space-y-3">
                {Object.entries({
                  'Database': status.services.database.status,
                  'Deepgram API': status.services.external_apis.deepgram,
                  'OpenAI API': status.services.external_apis.openai,
                  'Convoso API': status.services.external_apis.convoso
                }).map(([name, serviceStatus]) => (
                  <div key={name} className="flex items-center justify-between py-2 border-b last:border-b-0">
                    <span className="text-sm font-medium">{name}</span>
                    <div className="flex items-center gap-2">
                      <span style={{ color: getStatusColor(serviceStatus) }}>
                        {getStatusIcon(serviceStatus)}
                      </span>
                      <span
                        className="px-2 py-1 rounded text-xs text-white"
                        style={{ backgroundColor: getStatusColor(serviceStatus) }}
                      >
                        {serviceStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">Queue Status</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2 text-gray-700">Recording Queue</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Pending:</span>
                      <span className="font-medium">{status.services.queues.recordings.pending}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Processing:</span>
                      <span className="font-medium">{status.services.queues.recordings.processing}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Failed:</span>
                      <span className={`font-medium ${status.services.queues.recordings.failed > 10 ? 'text-red-500' : ''}`}>
                        {status.services.queues.recordings.failed}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Stale:</span>
                      <span className={`font-medium ${status.services.queues.recordings.stale > 0 ? 'text-yellow-500' : ''}`}>
                        {status.services.queues.recordings.stale}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2 text-gray-700">Transcription Queue</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Pending:</span>
                      <span className="font-medium">{status.services.queues.transcriptions.pending}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Processing:</span>
                      <span className="font-medium">{status.services.queues.transcriptions.processing}</span>
                    </div>
                    <div className="col-span-2 flex justify-between">
                      <span className="text-gray-600">Completed Today:</span>
                      <span className="font-medium text-green-600">
                        {status.services.queues.transcriptions.completed_today}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">Recent Activity (Last Hour)</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Calls Processed</span>
                  <span className="font-medium">{status.recent_activity.calls_processed_last_hour}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Recordings Fetched</span>
                  <span className="font-medium">{status.recent_activity.recordings_fetched_last_hour}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Transcriptions Completed</span>
                  <span className="font-medium">{status.recent_activity.transcriptions_completed_last_hour}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Analyses Completed</span>
                  <span className="font-medium">{status.recent_activity.analyses_completed_last_hour}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <a
                  href="/api/health"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-center"
                >
                  View Health Check
                </a>
                <a
                  href="/api/metrics/system"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-center"
                >
                  View System Metrics
                </a>
                <a
                  href="/api/metrics/jobs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-center"
                >
                  View Job Metrics
                </a>
                <a
                  href="/api/metrics/errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-center"
                >
                  View Error Metrics
                </a>
              </div>
            </div>
          </div>

          <div className="text-center text-xs text-gray-500 mt-6">
            Last updated: {new Date(status.timestamp).toLocaleString()}
            {autoRefresh && ' • Auto-refreshing every 30 seconds'}
          </div>
        </>
      )}
    </div>
  );
}