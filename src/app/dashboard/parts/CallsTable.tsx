'use client';
import { useState } from 'react';
import { withinCancelWindow } from '@/src/server/lib/biz';

type Row = {
  id: string;
  lead_id: string | null;
  customer_phone: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  recording_url: string | null;
  disposition: string | null;
  has_policy_300_plus?: boolean;
};

interface CallsTableProps {
  rows: Row[];
  onJobStart?: (callId: string, jobType: 'transcribe' | 'analyze') => void;
  jobProgress?: Record<string, number>;
  jobStatus?: Record<string, string>;
}

export default function CallsTable({ 
  rows, 
  onJobStart,
  jobProgress = {},
  jobStatus = {}
}: CallsTableProps) {
  const [busy, setBusy] = useState<string | null>(null);
  
  const doAction = async (endpoint: 'transcribe' | 'analyze', callId: string) => {
    try {
      setBusy(callId + endpoint);
      
      // Notify parent about job start if handler provided
      if (onJobStart) {
        onJobStart(callId, endpoint);
      }
      
      const res = await fetch(`/api/ui/trigger/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callId }),
      });
      const data = await res.json();
      
      if (!data.ok) {
        alert(`${endpoint} failed: ${data.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert('Request failed');
    } finally {
      setBusy(null);
    }
  };

  const getDispositionBadge = (disposition: string | null) => {
    if (!disposition) return null;
    
    const colors: Record<string, string> = {
      'Completed': 'badge-success',
      'No Answer': 'badge-warning',
      'Busy': 'badge-error',
      'Failed': 'badge-error',
      'Voicemail': 'badge-info'
    };
    
    return colors[disposition] || 'badge-info';
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Started</th>
            <th>Lead ID</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Recording</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.id}>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 500 }}>
                    {r.started_at ? new Date(r.started_at).toLocaleDateString() : '—'}
                  </span>
                  <span style={{ fontSize: 12, color: '#6b6b7c' }}>
                    {r.started_at ? new Date(r.started_at).toLocaleTimeString() : '—'}
                  </span>
                </div>
              </td>
              <td>
                <span style={{ 
                  fontFamily: 'monospace',
                  fontSize: 13,
                  color: '#a8a8b3'
                }}>
                  {r.lead_id ?? '—'}
                </span>
              </td>
              <td>
                {r.customer_phone ? (
                  <a 
                    href={`/journey/${r.customer_phone.replace(/\D/g, '')}`}
                    style={{ color: '#00d4ff', textDecoration: 'none' }}
                    title="View customer journey"
                  >
                    {r.customer_phone}
                  </a>
                ) : '—'}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {r.disposition ? (
                    <span className={`badge ${getDispositionBadge(r.disposition)}`}>
                      {r.disposition}
                    </span>
                  ) : '—'}
                  {r.has_policy_300_plus && (
                    <span className="badge badge-info">$300+ Policy</span>
                  )}
                  {withinCancelWindow(r.started_at) && (
                    <span className="badge badge-warning">Cancelable ≤24h</span>
                  )}
                </div>
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5 }}>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>{r.duration_sec ? `${r.duration_sec}s` : '—'}</span>
                </div>
              </td>
              <td>
                {r.recording_url ? (
                  <a 
                    href={r.recording_url} 
                    target="_blank" 
                    className="btn btn-ghost"
                    style={{ 
                      padding: '4px 12px',
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Play
                  </a>
                ) : '—'}
              </td>
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <a 
                    href={`/call/${r.id}`} 
                    className="btn btn-ghost"
                    style={{ 
                      padding: '6px 12px',
                      fontSize: 12
                    }}
                  >
                    View
                  </a>
                  <button
                    disabled={busy !== null}
                    onClick={() => doAction('transcribe', r.id)}
                    className="btn btn-ghost"
                    style={{ 
                      padding: '6px 12px',
                      fontSize: 12,
                      opacity: busy === r.id + 'transcribe' ? 0.5 : 1
                    }}
                  >
                    {busy === r.id + 'transcribe' ? (
                      <span className="pulse">Processing...</span>
                    ) : 'Transcribe'}
                  </button>
                  <button
                    disabled={busy !== null}
                    onClick={() => doAction('analyze', r.id)}
                    className="btn btn-primary"
                    style={{ 
                      padding: '6px 12px',
                      fontSize: 12,
                      opacity: busy === r.id + 'analyze' ? 0.5 : 1
                    }}
                  >
                    {busy === r.id + 'analyze' ? (
                      <span className="pulse">Processing...</span>
                    ) : 'Analyze'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!rows?.length && (
            <tr>
              <td colSpan={7} style={{ 
                padding: 40, 
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
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>No calls detected</div>
                    <div style={{ fontSize: 12 }}>
                      Send webhooks to <code style={{ 
                        background: '#1a1a24',
                        padding: '2px 6px',
                        borderRadius: 4,
                        color: '#00d4ff'
                      }}>/api/hooks/convoso</code> to populate
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}