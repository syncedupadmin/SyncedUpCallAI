'use client';
import { useState } from 'react';
import useSWR from 'swr';

export default function CustomerJourney({ params }: { params: { phone: string } }) {
  const [busy, setBusy] = useState<string | null>(null);
  
  const { data, mutate } = useSWR(
    `/api/ui/journey?phone=${params.phone}`,
    u => fetch(u).then(r => r.json())
  );

  const doAction = async (endpoint: 'transcribe' | 'analyze', callId: string, recordingUrl?: string) => {
    try {
      setBusy(callId + endpoint);
      
      const body: any = { callId };
      if (endpoint === 'transcribe' && recordingUrl) {
        body.recordingUrl = recordingUrl;
      }
      
      const res = await fetch(`/api/ui/trigger/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      const result = await res.json();
      if (result.ok) {
        // Refresh the data
        mutate();
      } else {
        alert(`${endpoint} failed: ${result.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert('Request failed');
    } finally {
      setBusy(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="fade-in" style={{ padding: '40px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div className="glass-card" style={{ marginBottom: 32 }}>
        <h1 style={{ 
          fontSize: 28, 
          fontWeight: 700,
          background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 16
        }}>
          Customer Journey
        </h1>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#00d4ff' }}>
              {params.phone}
            </div>
            <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>Phone Number</div>
          </div>
          
          {data?.stats && (
            <>
              <div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>
                  {data.stats.totalCalls}
                </div>
                <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>Total Calls</div>
              </div>
              
              <div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>
                  {formatDuration(data.stats.totalDuration)}
                </div>
                <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>Total Duration</div>
              </div>
              
              <div>
                <div style={{ fontSize: 14 }}>
                  {data.stats.firstCall ? new Date(data.stats.firstCall).toLocaleDateString() : '—'}
                </div>
                <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>First Call</div>
              </div>
              
              <div>
                <div style={{ fontSize: 14 }}>
                  {data.stats.lastCall ? new Date(data.stats.lastCall).toLocaleDateString() : '—'}
                </div>
                <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>Last Call</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Calls List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {data?.calls?.map((call: any) => (
          <div key={call.id} className="glass-card" style={{ position: 'relative' }}>
            {/* Call Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {call.started_at ? new Date(call.started_at).toLocaleString() : 'Unknown Date'}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <span className="badge badge-info" style={{ fontSize: 11 }}>
                    {call.direction || 'Unknown'}
                  </span>
                  {call.disposition && (
                    <span className="badge" style={{ fontSize: 11 }}>
                      {call.disposition}
                    </span>
                  )}
                  {call.campaign && (
                    <span style={{ fontSize: 12, color: '#6b6b7c' }}>
                      Campaign: {call.campaign}
                    </span>
                  )}
                </div>
              </div>
              
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#00d4ff' }}>
                  {call.duration_sec}s
                </div>
                <div style={{ fontSize: 12, color: '#6b6b7c' }}>
                  Agent: {call.agent_name || 'Unknown'}
                </div>
              </div>
            </div>

            {/* Analysis Summary */}
            {call.summary && (
              <div style={{ 
                padding: 16, 
                background: 'rgba(0, 212, 255, 0.05)',
                borderRadius: 8,
                marginBottom: 16,
                borderLeft: '3px solid #00d4ff'
              }}>
                <div style={{ fontSize: 12, color: '#00d4ff', marginBottom: 8 }}>
                  Analysis Summary
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                  {call.summary}
                </div>
                {call.reason_primary && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 12, color: '#6b6b7c' }}>
                      Reason: <span style={{ color: '#fff' }}>{call.reason_primary}</span>
                    </span>
                    {call.qa_score !== null && (
                      <span style={{ fontSize: 12, color: '#6b6b7c' }}>
                        QA Score: <span style={{ color: '#fff' }}>{call.qa_score}/100</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              {call.recording_url && (
                <a 
                  href={call.recording_url} 
                  target="_blank"
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Play Recording
                </a>
              )}
              
              {call.recording_url && !call.has_transcript && (
                <button
                  onClick={() => doAction('transcribe', call.id, call.recording_url)}
                  disabled={busy !== null}
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                >
                  {busy === call.id + 'transcribe' ? 'Processing...' : 'Transcribe'}
                </button>
              )}
              
              {call.has_transcript && !call.has_analysis && (
                <button
                  onClick={() => doAction('analyze', call.id)}
                  disabled={busy !== null}
                  className="btn btn-primary"
                  style={{ fontSize: 12 }}
                >
                  {busy === call.id + 'analyze' ? 'Processing...' : 'Analyze'}
                </button>
              )}
              
              <a 
                href={`/calls/${call.id}`}
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
              >
                View Details
              </a>
            </div>
          </div>
        ))}
        
        {data?.calls?.length === 0 && (
          <div className="glass-card" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 16, color: '#6b6b7c' }}>
              No calls found for this phone number
            </div>
          </div>
        )}
      </div>
    </div>
  );
}