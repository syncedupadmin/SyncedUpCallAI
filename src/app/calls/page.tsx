'use client';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import Pagination from '@/src/components/Pagination';

export default function CallsPage() {
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState({
    totalCalls: 0,
    todayCalls: 0,
    avgDuration: '0s',
    successRate: 0
  });
  const limit = 20;

  const { data, isLoading } = useSWR(
    `/api/ui/calls?limit=${limit}&offset=${offset}`,
    u => fetch(u).then(r=>r.json())
  );

  const rows = data?.data || [];
  const total = data?.total || 0;

  // Fetch stats
  useEffect(() => {
    fetch('/api/ui/stats/safe')
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.metrics) {
          setStats({
            totalCalls: data.metrics.totalCalls || 0,
            todayCalls: data.metrics.todayCalls || 0,
            avgDuration: data.metrics.avgDuration || '0s',
            successRate: data.metrics.successRate || 0
          });
        }
      })
      .catch(() => {});
  }, []);

  const getDispositionBadge = (disposition: string) => {
    const colors: Record<string, string> = {
      'Completed': '#10b981',
      'No Answer': '#f59e0b',
      'Busy': '#ef4444',
      'Failed': '#ef4444',
      'Voicemail': '#00d4ff'
    };

    return {
      background: `${colors[disposition] || '#6b6b7c'}20`,
      color: colors[disposition] || '#6b6b7c',
      border: `1px solid ${colors[disposition] || '#6b6b7c'}40`
    };
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="fade-in" style={{ padding: '40px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header Section */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{
          fontSize: 32,
          fontWeight: 700,
          background: 'linear-gradient(135deg, #ffffff 0%, #a8a8b3 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 8
        }}>
          Call Center Analytics
        </h1>
        <p style={{ color: '#6b6b7c', fontSize: 14 }}>
          Monitor and analyze all call activity across your organization
        </p>
      </div>

      {/* Quick Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 20,
        marginBottom: 32
      }}>
        <div style={{
          background: 'rgba(20, 20, 30, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: 20
        }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
            {stats.totalCalls.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Total Calls
          </div>
        </div>

        <div style={{
          background: 'rgba(20, 20, 30, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: 20
        }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#00d4ff', marginBottom: 4 }}>
            {stats.todayCalls}
          </div>
          <div style={{ fontSize: 12, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Today's Calls
          </div>
        </div>

        <div style={{
          background: 'rgba(20, 20, 30, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: 20
        }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#7c3aed', marginBottom: 4 }}>
            {stats.avgDuration}
          </div>
          <div style={{ fontSize: 12, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Avg Duration
          </div>
        </div>

        <div style={{
          background: 'rgba(20, 20, 30, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: 20
        }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#10b981', marginBottom: 4 }}>
            {stats.successRate}%
          </div>
          <div style={{ fontSize: 12, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Success Rate
          </div>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h2 style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 4
            }}>
              Call History
            </h2>
            <p style={{ fontSize: 12, color: '#6b6b7c' }}>
              Comprehensive view of all calls with durations ≥10 seconds
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ fontSize: 12 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filter
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export
            </button>
          </div>
        </div>

        {isLoading && offset === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="pulse" style={{ color: '#6b6b7c' }}>Loading call history...</div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '16px 24px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b6b7c', fontWeight: 600 }}>
                      Date & Time
                    </th>
                    <th style={{ padding: '16px 24px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b6b7c', fontWeight: 600 }}>
                      Agent
                    </th>
                    <th style={{ padding: '16px 24px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b6b7c', fontWeight: 600 }}>
                      Customer
                    </th>
                    <th style={{ padding: '16px 24px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b6b7c', fontWeight: 600 }}>
                      Status
                    </th>
                    <th style={{ padding: '16px 24px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b6b7c', fontWeight: 600 }}>
                      Reason
                    </th>
                    <th style={{ padding: '16px 24px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b6b7c', fontWeight: 600 }}>
                      Duration
                    </th>
                    <th style={{ padding: '16px 24px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b6b7c', fontWeight: 600 }}>
                      Summary
                    </th>
                    <th style={{ padding: '16px 24px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b6b7c', fontWeight: 600, textAlign: 'right' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r:any) => (
                    <tr key={r.id} style={{ borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '20px 24px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 500, fontSize: 14 }}>
                            {r.started_at ? new Date(r.started_at).toLocaleDateString() : '—'}
                          </span>
                          <span style={{ fontSize: 12, color: '#6b6b7c' }}>
                            {r.started_at ? new Date(r.started_at).toLocaleTimeString() : '—'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '20px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#fff'
                          }}>
                            {(r.agent || 'A')[0].toUpperCase()}
                          </div>
                          <span style={{ fontSize: 14 }}>{r.agent || 'Unknown'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '20px 24px' }}>
                        {r.primary_phone ? (
                          <a
                            href={`/journey/${r.primary_phone.replace(/\D/g, '')}`}
                            style={{
                              color: '#00d4ff',
                              textDecoration: 'none',
                              fontSize: 14,
                              fontFamily: 'monospace'
                            }}
                            title="View customer journey"
                          >
                            {r.primary_phone}
                          </a>
                        ) : (
                          <span style={{ color: '#6b6b7c' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '20px 24px' }}>
                        {r.disposition ? (
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: 16,
                            fontSize: 12,
                            fontWeight: 500,
                            ...getDispositionBadge(r.disposition)
                          }}>
                            {r.disposition}
                          </span>
                        ) : (
                          <span style={{ color: '#6b6b7c' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '20px 24px' }}>
                        <span style={{ fontSize: 14, color: '#a8a8b3' }}>
                          {r.reason_primary || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '20px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5 }}>
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span style={{ fontSize: 14, fontWeight: 500 }}>
                            {formatDuration(r.duration_sec)}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '20px 24px', maxWidth: 300 }}>
                        <div style={{
                          fontSize: 13,
                          color: '#a8a8b3',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }} title={r.summary || ''}>
                          {r.summary || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '20px 24px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <a
                            href={`/call/${r.id}`}
                            className="btn btn-ghost"
                            style={{
                              padding: '6px 12px',
                              fontSize: 12,
                              textDecoration: 'none'
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            View
                          </a>
                          {r.recording_url && (
                            <a
                              href={r.recording_url}
                              target="_blank"
                              className="btn btn-primary"
                              style={{
                                padding: '6px 12px',
                                fontSize: 12,
                                textDecoration: 'none'
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                              Play
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={8} style={{
                        padding: 60,
                        textAlign: 'center',
                        color: '#6b6b7c'
                      }}>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 16
                        }}>
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3 }}>
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                          <div>
                            <div style={{ fontWeight: 500, marginBottom: 4 }}>No calls found</div>
                            <div style={{ fontSize: 12 }}>
                              Calls will appear here as they are processed
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {total > 0 && (
              <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <Pagination
                  total={total}
                  limit={limit}
                  offset={offset}
                  onPageChange={setOffset}
                  loading={isLoading}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Live Activity Indicator */}
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        padding: '12px 20px',
        background: 'rgba(20, 20, 30, 0.9)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        fontSize: 12,
        color: '#a8a8b3'
      }}>
        <div className="pulse" style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#00d4ff'
        }} />
        <span>Live Updates</span>
        <span style={{ color: '#00d4ff', fontWeight: 600 }}>
          {total} Total Calls
        </span>
      </div>
    </div>
  );
}