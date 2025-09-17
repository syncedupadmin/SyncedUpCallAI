'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Play, Clock, AlertTriangle, Check, X, Calendar, Activity } from 'lucide-react';

interface SyncStatus {
  id: string;
  syncType: string;
  startedAt: string;
  completedAt: string | null;
  processed: number;
  inserted: number;
  updated: number;
  failed: number;
  error: string | null;
  durationMs: number | null;
}

interface ConvosoHealth {
  status: 'healthy' | 'degraded';
  lastSuccess: {
    at: string;
    records: number;
    minutesAgo: number;
  } | null;
  circuit: {
    state: string;
    failures: number;
  };
  cronHeartbeat: {
    lastRun: string;
  } | null;
}

export default function ConvosoPanel() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [syncHistory, setSyncHistory] = useState<SyncStatus[]>([]);
  const [health, setHealth] = useState<ConvosoHealth | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/integrations/convoso/status');
      const data = await res.json();
      if (data.ok) {
        setSyncHistory(data.history || []);
        setHealth(data.health);
      }
    } catch (err) {
      console.error('Failed to fetch Convoso status:', err);
    }
  };

  const triggerSync = async (mode: string, params: any = {}) => {
    setLoading({ ...loading, [mode]: true });
    setMessage(null);

    try {
      const secret = prompt('Enter JOBS_SECRET:');
      if (!secret) {
        setLoading({ ...loading, [mode]: false });
        return;
      }

      const body: any = { ...params };

      // Set mode-specific parameters
      switch (mode) {
        case 'delta':
          body.pages = 1;
          body.perPage = 200;
          // Calculate 15 minutes ago
          const now = new Date();
          const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
          body.from = fifteenMinutesAgo.toISOString();
          body.to = now.toISOString();
          break;
        case 'backfill_24h':
          body.pages = 10;
          body.perPage = 200;
          body.from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          body.to = new Date().toISOString();
          break;
        case 'backfill_7d':
          body.pages = 50;
          body.perPage = 200;
          body.from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          body.to = new Date().toISOString();
          break;
        case 'retry_failed':
          // TODO: Implement retry failed logic
          console.warn('Retry failed not yet implemented');
          body.mode = 'retry_failed';
          body.window = '24h';
          break;
      }

      const res = await fetch('/api/integrations/convoso/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-jobs-secret': secret,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({
          type: 'success',
          text: `Sync complete: ${data.scanned} scanned, ${data.inserted} inserted, ${data.updated} updated`,
        });
        // Refresh status after sync
        setTimeout(fetchStatus, 2000);
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Sync failed',
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to trigger sync',
      });
    } finally {
      setLoading({ ...loading, [mode]: false });
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${((ms || 0) / 1000).toFixed(1)}s`;
    return `${((ms || 0) / 60000).toFixed(1)}m`;
  };

  const formatTime = (date: string | null) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    const d = new Date(date);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    if (isToday) {
      return formatTime(date);
    }

    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const getHealthBadgeColor = () => {
    if (!health) return 'rgba(107, 107, 124, 0.2)';
    if (health.status === 'healthy') return 'rgba(16, 185, 129, 0.2)';
    return 'rgba(239, 68, 68, 0.2)';
  };

  const getHealthBadgeText = () => {
    if (!health) return 'Unknown';
    if (health.status === 'healthy') return 'Healthy';
    return 'Degraded';
  };

  return (
    <div className="glass-card" style={{ gridColumn: 'span 2' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            Convoso Sync
          </h3>
          <span style={{
            padding: '4px 12px',
            borderRadius: 16,
            fontSize: 12,
            fontWeight: 500,
            background: getHealthBadgeColor(),
            color: health?.status === 'healthy' ? '#10b981' : health?.status === 'degraded' ? '#ef4444' : '#6b6b7c',
            border: `1px solid ${health?.status === 'healthy' ? 'rgba(16, 185, 129, 0.3)' : health?.status === 'degraded' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(107, 107, 124, 0.3)'}`
          }}>
            {getHealthBadgeText()}
          </span>
        </div>
        <button
          onClick={fetchStatus}
          className="btn btn-ghost"
          style={{ padding: '8px 12px' }}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Health Summary */}
      {health && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 20,
          padding: 16,
          background: 'rgba(20, 20, 30, 0.4)',
          borderRadius: 8
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b6b7c', marginBottom: 4 }}>Last Success</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {health.lastSuccess ? `${health.lastSuccess.minutesAgo}m ago` : 'Never'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b6b7c', marginBottom: 4 }}>Circuit State</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: health.circuit.state === 'closed' ? '#10b981' : '#ef4444' }}>
              {health.circuit.state}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b6b7c', marginBottom: 4 }}>Cron Heartbeat</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {health.cronHeartbeat ? formatTime(health.cronHeartbeat.lastRun) : 'Not running'}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12,
        marginBottom: 24
      }}>
        <button
          onClick={() => triggerSync('delta')}
          disabled={loading.delta}
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px'
          }}
        >
          {loading.delta ? (
            <RefreshCw size={16} className="spin" />
          ) : (
            <Play size={16} />
          )}
          <span>Sync Now (Delta)</span>
        </button>

        <button
          onClick={() => triggerSync('backfill_24h')}
          disabled={loading.backfill_24h}
          className="btn btn-secondary"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px'
          }}
        >
          {loading.backfill_24h ? (
            <RefreshCw size={16} className="spin" />
          ) : (
            <Clock size={16} />
          )}
          <span>Backfill 24h</span>
        </button>

        <button
          onClick={() => triggerSync('backfill_7d')}
          disabled={loading.backfill_7d}
          className="btn btn-secondary"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px'
          }}
        >
          {loading.backfill_7d ? (
            <RefreshCw size={16} className="spin" />
          ) : (
            <Calendar size={16} />
          )}
          <span>Backfill 7d</span>
        </button>

        <button
          onClick={() => triggerSync('retry_failed')}
          disabled={loading.retry_failed}
          className="btn btn-warning"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 16px'
          }}
        >
          {loading.retry_failed ? (
            <RefreshCw size={16} className="spin" />
          ) : (
            <AlertTriangle size={16} />
          )}
          <span>Retry Failed</span>
        </button>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '12px 16px',
          marginBottom: 20,
          borderRadius: 8,
          background: message.type === 'success'
            ? 'rgba(16, 185, 129, 0.1)'
            : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${message.type === 'success'
            ? 'rgba(16, 185, 129, 0.3)'
            : 'rgba(239, 68, 68, 0.3)'}`,
          color: message.type === 'success' ? '#10b981' : '#ef4444',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          {message.type === 'success' ? <Check size={16} /> : <X size={16} />}
          {message.text}
        </div>
      )}

      {/* Sync History Table */}
      <div>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#a8a8b3' }}>
          Last Runs
        </h4>
        <div style={{
          overflowX: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 8
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#6b6b7c', fontWeight: 500 }}>
                  COMPLETED
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#6b6b7c', fontWeight: 500 }}>
                  TYPE
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#6b6b7c', fontWeight: 500 }}>
                  SCANNED
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#6b6b7c', fontWeight: 500 }}>
                  INSERTED
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#6b6b7c', fontWeight: 500 }}>
                  UPDATED
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#6b6b7c', fontWeight: 500 }}>
                  FAILED
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#6b6b7c', fontWeight: 500 }}>
                  DURATION
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#6b6b7c', fontWeight: 500 }}>
                  STATUS
                </th>
              </tr>
            </thead>
            <tbody>
              {syncHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{
                    padding: 24,
                    textAlign: 'center',
                    color: '#6b6b7c',
                    fontSize: 13
                  }}>
                    No sync history available
                  </td>
                </tr>
              ) : (
                syncHistory.slice(0, 20).map((sync) => (
                  <tr key={sync.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '12px', fontSize: 12, fontFamily: 'monospace' }}>
                      {formatDate(sync.completedAt)}
                    </td>
                    <td style={{ padding: '12px', fontSize: 12 }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: sync.syncType === 'delta'
                          ? 'rgba(124, 58, 237, 0.2)'
                          : sync.syncType === 'backfill'
                          ? 'rgba(59, 130, 246, 0.2)'
                          : 'rgba(107, 107, 124, 0.2)',
                        color: sync.syncType === 'delta'
                          ? '#a78bfa'
                          : sync.syncType === 'backfill'
                          ? '#60a5fa'
                          : '#a8a8b3',
                        fontSize: 11,
                        fontWeight: 500
                      }}>
                        {sync.syncType}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 12 }}>
                      {sync.processed}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 12, color: sync.inserted > 0 ? '#10b981' : '#6b6b7c' }}>
                      {sync.inserted}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 12, color: sync.updated > 0 ? '#60a5fa' : '#6b6b7c' }}>
                      {sync.updated}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 12, color: sync.failed > 0 ? '#ef4444' : '#6b6b7c' }}>
                      {sync.failed}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace' }}>
                      {formatDuration(sync.durationMs)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {sync.error ? (
                        <span title={sync.error}>
                          <X size={14} color="#ef4444" />
                        </span>
                      ) : (
                        <Check size={14} color="#10b981" />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}