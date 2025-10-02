'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Play, Pause, X, RotateCcw, Eye, Search, Filter, FileText, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

interface DiscoverySession {
  id: string;
  agency_id: string;
  agency_name: string;
  status: string;
  progress: number;
  processed: number;
  total_calls: number;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number;
  queue_stats: QueueStats;
  metrics: any;
  error_message: string | null;
  config: any;
}

interface SystemStats {
  active_count: number;
  queued_count: number;
  completed_today: number;
  failed_today: number;
  total_pending_calls: number;
  total_processing_calls: number;
  total_completed_calls: number;
  avg_duration_minutes: number;
}

export default function DiscoveryManagementPage() {
  const [sessions, setSessions] = useState<DiscoverySession[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [selectedSession, setSelectedSession] = useState<DiscoverySession | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewingLogs, setViewingLogs] = useState<string | null>(null);
  const [logsData, setLogsData] = useState<any>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  // Fetch sessions
  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/superadmin/discovery/sessions');

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('API Error:', { status: res.status, statusText: res.statusText, error: errorData });
        throw new Error(errorData.error || `Failed to fetch sessions: ${res.status}`);
      }

      const data = await res.json();
      setSessions(data.sessions);
      setSystemStats(data.system_stats);
    } catch (error: any) {
      console.error('Error fetching sessions:', error);
      toast.error(error.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  // Fetch logs for a session
  const fetchLogs = async (sessionId: string) => {
    setLogsLoading(true);
    setViewingLogs(sessionId);
    setLogsData(null);

    try {
      const res = await fetch(`/api/superadmin/discovery/logs?session_id=${sessionId}`);

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch logs');
      }

      const data = await res.json();
      setLogsData(data);
    } catch (error: any) {
      console.error('Error fetching logs:', error);
      toast.error(error.message || 'Failed to load logs');
      setViewingLogs(null);
    } finally {
      setLogsLoading(false);
    }
  };

  // Auto-refresh every 2 seconds
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 2000);
    return () => clearInterval(interval);
  }, []);

  // Perform action on session
  const performAction = async (sessionId: string, action: string) => {
    const key = `${sessionId}-${action}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));

    try {
      const res = await fetch('/api/superadmin/discovery/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, action })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Action failed');
      }

      const result = await res.json();
      toast.success(result.message || `Action ${action} successful`);
      await fetchSessions();
    } catch (error: any) {
      console.error(`Error performing ${action}:`, error);
      toast.error(error.message || `Failed to ${action} session`);
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
      complete: 'bg-green-500/20 text-green-400 border-green-500/50',
      processing: 'bg-blue-500/20 text-blue-400 border-blue-500/50 animate-pulse',
      queued: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      error: 'bg-red-500/20 text-red-400 border-red-500/50',
      cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
      paused: 'bg-orange-500/20 text-orange-400 border-orange-500/50'
    };

    const icons: Record<string, string> = {
      complete: '✅',
      processing: '⏱️',
      queued: '⏸️',
      error: '❌',
      cancelled: '⚪',
      paused: '⏸️'
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.cancelled}`}>
        {icons[status] || '•'} {status.toUpperCase()}
      </span>
    );
  };

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.agency_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          session.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Discovery Management</h1>
        <p className="text-gray-400">Monitor and control all discovery sessions in real-time</p>
      </div>

      {/* System Stats Dashboard */}
      {systemStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Active Sessions</div>
            <div className="text-3xl font-bold text-blue-400">{systemStats.active_count}</div>
            <div className="text-xs text-gray-500 mt-1">{systemStats.queued_count} queued</div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Completed Today</div>
            <div className="text-3xl font-bold text-green-400">{systemStats.completed_today}</div>
            <div className="text-xs text-gray-500 mt-1">{systemStats.failed_today} failed</div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Calls in Queue</div>
            <div className="text-3xl font-bold text-yellow-400">{systemStats.total_pending_calls.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">{systemStats.total_processing_calls} processing</div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Avg Duration</div>
            <div className="text-3xl font-bold text-purple-400">{systemStats.avg_duration_minutes}m</div>
            <div className="text-xs text-gray-500 mt-1">{systemStats.total_completed_calls.toLocaleString()} completed</div>
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by agency name or session ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Status</option>
          <option value="processing">Processing</option>
          <option value="queued">Queued</option>
          <option value="complete">Complete</option>
          <option value="error">Error</option>
          <option value="cancelled">Cancelled</option>
          <option value="paused">Paused</option>
        </select>

        <button
          onClick={fetchSessions}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Sessions Table */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-gray-900/50 border-b border-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Agency
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Calls
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Started
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-400 uppercase tracking-wider w-40">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    No discovery sessions found
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-gray-900/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">{session.agency_name}</div>
                      <div className="text-xs text-gray-500">{session.id.slice(0, 8)}...</div>
                      {session.error_message && (
                        <div className="mt-1 text-xs text-red-400 max-w-xs truncate" title={session.error_message}>
                          ⚠️ {session.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={session.status} />
                      {session.status === 'initializing' && (
                        <div className="text-xs text-yellow-400 mt-1">
                          Waiting for cron job...
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-700 rounded-full h-2 w-24">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${session.progress}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-400">{session.progress}%</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {session.processed.toLocaleString()} / {session.total_calls.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
                        <div>✅ {session.queue_stats.completed.toLocaleString()}</div>
                        <div>⏳ {session.queue_stats.pending.toLocaleString()}</div>
                        {session.queue_stats.failed > 0 && (
                          <div className="text-red-400">❌ {session.queue_stats.failed}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {new Date(session.started_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {formatDuration(session.duration_seconds)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        {/* View Details */}
                        <button
                          onClick={() => setSelectedSession(session)}
                          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4 text-gray-400" />
                        </button>

                        {/* View Logs */}
                        <button
                          onClick={() => fetchLogs(session.id)}
                          className="p-2 hover:bg-blue-600/20 rounded-lg transition-colors relative"
                          title="View Logs & Diagnostics"
                        >
                          <FileText className="w-4 h-4 text-blue-400" />
                          {(session.error_message || session.queue_stats.failed > 0) && (
                            <AlertCircle className="w-2 h-2 text-red-500 absolute top-1 right-1" />
                          )}
                        </button>

                        {/* Processing: Pause & Cancel */}
                        {session.status === 'processing' && (
                          <>
                            <button
                              onClick={() => performAction(session.id, 'pause')}
                              disabled={actionLoading[`${session.id}-pause`]}
                              className="p-2 hover:bg-yellow-600/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Pause"
                            >
                              <Pause className="w-4 h-4 text-yellow-400" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Cancel this discovery session?')) {
                                  performAction(session.id, 'cancel');
                                }
                              }}
                              disabled={actionLoading[`${session.id}-cancel`]}
                              className="p-2 hover:bg-red-600/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Cancel"
                            >
                              <X className="w-4 h-4 text-red-400" />
                            </button>
                          </>
                        )}

                        {/* Queued: Start & Cancel */}
                        {session.status === 'queued' && (
                          <>
                            <button
                              onClick={() => performAction(session.id, 'resume')}
                              disabled={actionLoading[`${session.id}-resume`]}
                              className="p-2 hover:bg-green-600/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Start Processing"
                            >
                              <Play className="w-4 h-4 text-green-400" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Cancel this discovery session?')) {
                                  performAction(session.id, 'cancel');
                                }
                              }}
                              disabled={actionLoading[`${session.id}-cancel`]}
                              className="p-2 hover:bg-red-600/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Cancel"
                            >
                              <X className="w-4 h-4 text-red-400" />
                            </button>
                          </>
                        )}

                        {/* Paused: Resume & Cancel */}
                        {session.status === 'paused' && (
                          <>
                            <button
                              onClick={() => performAction(session.id, 'resume')}
                              disabled={actionLoading[`${session.id}-resume`]}
                              className="p-2 hover:bg-green-600/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Resume"
                            >
                              <Play className="w-4 h-4 text-green-400" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Cancel this discovery session?')) {
                                  performAction(session.id, 'cancel');
                                }
                              }}
                              disabled={actionLoading[`${session.id}-cancel`]}
                              className="p-2 hover:bg-red-600/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Cancel"
                            >
                              <X className="w-4 h-4 text-red-400" />
                            </button>
                          </>
                        )}

                        {/* Complete/Error/Cancelled: Restart */}
                        {['complete', 'error', 'cancelled'].includes(session.status) && (
                          <button
                            onClick={() => {
                              if (confirm('Restart this discovery session? This will reset all calls and start over.')) {
                                performAction(session.id, 'restart');
                              }
                            }}
                            disabled={actionLoading[`${session.id}-restart`]}
                            className="p-2 hover:bg-blue-600/20 rounded-lg transition-colors disabled:opacity-50"
                            title="Restart"
                          >
                            <RotateCcw className="w-4 h-4 text-blue-400" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Session Detail Modal */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Session Details</h2>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-400">Session ID</div>
                  <div className="text-white font-mono text-sm">{selectedSession.id}</div>
                </div>

                <div>
                  <div className="text-sm text-gray-400">Agency</div>
                  <div className="text-white">{selectedSession.agency_name}</div>
                </div>

                <div>
                  <div className="text-sm text-gray-400">Status</div>
                  <div className="mt-1"><StatusBadge status={selectedSession.status} /></div>
                </div>

                <div>
                  <div className="text-sm text-gray-400">Progress</div>
                  <div className="text-white">
                    {selectedSession.progress}% ({selectedSession.processed.toLocaleString()} / {selectedSession.total_calls.toLocaleString()} calls)
                  </div>
                </div>

                <div>
                  <div className="text-sm text-gray-400">Duration</div>
                  <div className="text-white">{formatDuration(selectedSession.duration_seconds)}</div>
                </div>

                <div>
                  <div className="text-sm text-gray-400 mb-2">Queue Breakdown</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-800 rounded-lg p-3">
                      <div className="text-gray-400 text-xs">Pending</div>
                      <div className="text-white text-lg font-bold">{selectedSession.queue_stats.pending.toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3">
                      <div className="text-gray-400 text-xs">Processing</div>
                      <div className="text-white text-lg font-bold">{selectedSession.queue_stats.processing.toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3">
                      <div className="text-gray-400 text-xs">Completed</div>
                      <div className="text-green-400 text-lg font-bold">{selectedSession.queue_stats.completed.toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3">
                      <div className="text-gray-400 text-xs">Failed</div>
                      <div className="text-red-400 text-lg font-bold">{selectedSession.queue_stats.failed.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {selectedSession.metrics && Object.keys(selectedSession.metrics).length > 0 && (
                  <div>
                    <div className="text-sm text-gray-400 mb-2">Metrics (from completed calls)</div>
                    <div className="bg-gray-800 rounded-lg p-4">
                      <pre className="text-white text-xs overflow-x-auto">
                        {JSON.stringify(selectedSession.metrics, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {selectedSession.error_message && (
                  <div>
                    <div className="text-sm text-gray-400 mb-2">Error Message</div>
                    <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
                      <div className="text-red-400 text-sm">{selectedSession.error_message}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {viewingLogs && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <FileText className="w-6 h-6" />
                  Session Logs & Diagnostics
                </h2>
                <button
                  onClick={() => {
                    setViewingLogs(null);
                    setLogsData(null);
                  }}
                  className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {logsLoading ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
                  <div className="text-gray-400">Loading diagnostics...</div>
                </div>
              ) : logsData ? (
                <div className="space-y-6">
                  {/* Diagnostics Section */}
                  {logsData.diagnostics && (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                      <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-yellow-400" />
                        System Diagnostics
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                          <span className="text-gray-400 min-w-[140px]">Status:</span>
                          <span className={logsData.diagnostics.is_stuck ? 'text-red-400 font-bold' : 'text-green-400'}>
                            {logsData.diagnostics.is_stuck ? '⚠️ STUCK - Session not progressing' : '✓ Normal'}
                          </span>
                        </div>
                        {logsData.diagnostics.stuck_reason && (
                          <div className="flex items-start gap-2">
                            <span className="text-gray-400 min-w-[140px]">Reason:</span>
                            <span className="text-red-400">{logsData.diagnostics.stuck_reason}</span>
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          <span className="text-gray-400 min-w-[140px]">Calls Queued:</span>
                          <span className="text-white">{logsData.diagnostics.has_calls_queued ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-gray-400 min-w-[140px]">With Recordings:</span>
                          <span className="text-white">{logsData.diagnostics.calls_with_recordings || 0}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-gray-400 min-w-[140px]">Suggested Action:</span>
                          <span className="text-yellow-400 font-medium">{logsData.diagnostics.suggested_action}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Status Breakdown */}
                  <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                    <h3 className="text-lg font-bold text-white mb-3">Call Status Breakdown</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-gray-900 rounded-lg p-3 text-center">
                        <div className="text-gray-400 text-xs">Pending</div>
                        <div className="text-white text-xl font-bold">{logsData.status_breakdown.pending.toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-3 text-center">
                        <div className="text-gray-400 text-xs">Processing</div>
                        <div className="text-blue-400 text-xl font-bold">{logsData.status_breakdown.processing.toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-3 text-center">
                        <div className="text-gray-400 text-xs">Completed</div>
                        <div className="text-green-400 text-xl font-bold">{logsData.status_breakdown.completed.toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-3 text-center">
                        <div className="text-gray-400 text-xs">Failed</div>
                        <div className="text-red-400 text-xl font-bold">{logsData.status_breakdown.failed.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  {/* Recording Stats */}
                  <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                    <h3 className="text-lg font-bold text-white mb-3">Recording Availability</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-900 rounded-lg p-3 text-center">
                        <div className="text-gray-400 text-xs">With Recordings</div>
                        <div className="text-green-400 text-xl font-bold">{logsData.recording_stats.with_recordings.toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-3 text-center">
                        <div className="text-gray-400 text-xs">Without Recordings</div>
                        <div className="text-red-400 text-xl font-bold">{logsData.recording_stats.without_recordings.toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-3 text-center">
                        <div className="text-gray-400 text-xs">Percentage</div>
                        <div className="text-white text-xl font-bold">{logsData.recording_stats.percentage}%</div>
                      </div>
                    </div>
                  </div>

                  {/* Error Breakdown */}
                  {logsData.error_breakdown && logsData.error_breakdown.length > 0 && (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                      <h3 className="text-lg font-bold text-white mb-3">Top Failure Reasons</h3>
                      <div className="space-y-2">
                        {logsData.error_breakdown.map((item: any, idx: number) => (
                          <div key={idx} className="bg-gray-900 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-red-400 font-medium text-sm">{item.error}</span>
                              <span className="text-white text-sm font-bold">{item.count}x</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              Sample IDs: {item.samples.join(', ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Session Error */}
                  {logsData.session.error_message && (
                    <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
                      <h3 className="text-lg font-bold text-red-400 mb-2">Session Error</h3>
                      <div className="text-red-300 text-sm">{logsData.session.error_message}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  Failed to load logs
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
