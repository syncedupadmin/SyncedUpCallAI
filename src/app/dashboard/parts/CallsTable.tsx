'use client';
import { useState } from 'react';

type Row = {
  id: string;
  lead_id: string | null;
  customer_phone: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  recording_url: string | null;
  disposition: string | null;
};

export default function CallsTable({ rows }: { rows: Row[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const doAction = async (endpoint: 'transcribe' | 'analyze', callId: string) => {
    try {
      setBusy(callId + endpoint);
      const res = await fetch(`/api/ui/trigger/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callId }),
      });
      const data = await res.json();
      alert(`${endpoint}: ` + JSON.stringify(data));
    } catch (e: any) {
      alert('Request failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #333' }}>
            <th align="left" style={{ padding: 8 }}>Started</th>
            <th align="left" style={{ padding: 8 }}>Lead</th>
            <th align="left" style={{ padding: 8 }}>Phone</th>
            <th align="left" style={{ padding: 8 }}>Disposition</th>
            <th align="left" style={{ padding: 8 }}>Duration</th>
            <th align="left" style={{ padding: 8 }}>Recording</th>
            <th align="left" style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid #222' }}>
              <td style={{ padding: 8 }}>{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
              <td style={{ padding: 8 }}>{r.lead_id ?? '—'}</td>
              <td style={{ padding: 8 }}>{r.customer_phone ?? '—'}</td>
              <td style={{ padding: 8 }}>{r.disposition ?? '—'}</td>
              <td style={{ padding: 8 }}>{r.duration_sec ?? '—'}</td>
              <td style={{ padding: 8 }}>
                {r.recording_url ? (
                  <a href={r.recording_url} target="_blank" style={{ color: '#0070f3' }}>Open</a>
                ) : '—'}
              </td>
              <td style={{ whiteSpace: 'nowrap', padding: 8 }}>
                <a href={`/calls/${r.id}`} style={{ color: '#0070f3' }}>View</a>
                {'  •  '}
                <button
                  disabled={busy !== null}
                  onClick={() => doAction('transcribe', r.id)}
                  style={{ cursor: busy ? 'wait' : 'pointer' }}
                >
                  {busy === r.id + 'transcribe' ? '…' : 'Transcribe'}
                </button>
                {'  '}
                <button
                  disabled={busy !== null}
                  onClick={() => doAction('analyze', r.id)}
                  style={{ cursor: busy ? 'wait' : 'pointer' }}
                >
                  {busy === r.id + 'analyze' ? '…' : 'Analyze'}
                </button>
              </td>
            </tr>
          ))}
          {!rows?.length && (
            <tr>
              <td colSpan={7} style={{ padding: 16, opacity: 0.7 }}>
                No calls yet. Send a webhook to <code>/api/hooks/convoso</code> to populate.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}