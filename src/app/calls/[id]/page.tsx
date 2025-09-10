'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProgressBar from '@/src/components/ProgressBar';

export default function CallDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript' | 'analysis' | 'timeline'>('summary');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetch(`/api/ui/call?id=${params.id}`)
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [params.id]);

  // Set up SSE for live status updates
  useEffect(() => {
    if (!params.id) return;

    const eventSource = new EventSource(`/api/ui/stream/${params.id}`);
    
    eventSource.addEventListener('status', (event) => {
      const data = JSON.parse(event.data);
      setLiveStatus(data.status);
      
      // Refresh data when done
      if (data.status === 'done') {
        fetch(`/api/ui/call?id=${params.id}`)
          .then(res => res.json())
          .then(d => setData(d))
          .catch(console.error);
      }
    });

    eventSource.addEventListener('error', () => {
      setLiveStatus(null);
    });

    return () => {
      eventSource.close();
    };
  }, [params.id]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const getSentimentColor = (sentiment: number) => {
    if (sentiment > 0.3) return '#10b981';
    if (sentiment < -0.3) return '#ef4444';
    return '#6b6b7c';
  };

  // Parse diarized segments
  const segments = useMemo(() => {
    if (!data?.transcript?.diarized) return [];
    try {
      return JSON.parse(data.transcript.diarized);
    } catch {
      return [];
    }
  }, [data]);

  // Parse key quotes
  const keyQuotes = useMemo(() => {
    if (!data?.analysis?.key_quotes) return [];
    try {
      return JSON.parse(data.analysis.key_quotes);
    } catch {
      return [];
    }
  }, [data]);

  // Highlight search in text
  const highlightText = (text: string) => {
    if (!searchQuery || searchQuery.length < 2) return text;
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark style="background: #fbbf24; color: #000; padding: 2px 0">$1</mark>');
  };

  // Copy link utility
  const copyLink = () => {
    const url = `${window.location.origin}/calls/${params.id}`;
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  // Download transcript
  const downloadTranscript = () => {
    window.open(`/api/ui/call/transcript?id=${params.id}&format=txt`, '_blank');
  };

  if (loading) {
    return (
      <div className="fade-in" style={{ padding: 40, textAlign: 'center' }}>
        <div className="pulse">Loading call details...</div>
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>Call not found</h2>
        <button onClick={() => router.back()} className="btn btn-ghost" style={{ marginTop: 20 }}>
          Go Back
        </button>
      </div>
    );
  }

  const { call, transcript, analysis, contact, events } = data;

  return (
    <div className="fade-in" style={{ padding: '40px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <button 
          onClick={() => router.back()} 
          className="btn btn-ghost"
          style={{ marginBottom: 16 }}
        >
          ← Back
        </button>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ 
              fontSize: 28, 
              fontWeight: 700,
              background: 'linear-gradient(135deg, #ffffff 0%, #a8a8b3 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: 8
            }}>
              Call Detail
            </h1>
            
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: '#6b6b7c', fontSize: 14 }}>
                {call.started_at ? new Date(call.started_at).toLocaleString() : 'Unknown time'}
              </span>
              {call.duration_sec && (
                <span className="badge badge-info">
                  {formatDuration(call.duration_sec)}
                </span>
              )}
              {transcript?.lang && transcript.lang !== 'en' && (
                <span className="badge" style={{ background: '#7c3aed' }}>
                  {transcript.lang.toUpperCase()}
                </span>
              )}
              {call.disposition && (
                <span className="badge">{call.disposition}</span>
              )}
              {liveStatus && (
                <span className="badge badge-warning pulse">
                  {liveStatus === 'transcribing' && '🎤 Transcribing...'}
                  {liveStatus === 'analyzing' && '🤖 Analyzing...'}
                  {liveStatus === 'done' && '✅ Complete'}
                  {liveStatus === 'error' && '❌ Error'}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyLink} className="btn btn-ghost" style={{ fontSize: 13 }}>
              🔗 Copy Link
            </button>
            {transcript && (
              <button onClick={downloadTranscript} className="btn btn-ghost" style={{ fontSize: 13 }}>
                📥 Download
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 32 }}>
        {/* Call Info */}
        <div className="glass-card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Call Information</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b6b7c', fontSize: 13 }}>Agent</span>
              <span style={{ fontWeight: 500 }}>{call.agent_name || 'Unknown'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b6b7c', fontSize: 13 }}>Customer</span>
              <span style={{ fontWeight: 500 }}>{call.customer_phone || 'Unknown'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#6b6b7c', fontSize: 13 }}>Campaign</span>
              <span style={{ fontWeight: 500 }}>{call.campaign || 'N/A'}</span>
            </div>
            {contact && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b6b7c', fontSize: 13 }}>Premium</span>
                <span style={{ fontWeight: 500 }}>${contact.premium || 0}/mo</span>
              </div>
            )}
          </div>
        </div>

        {/* QA Score */}
        {analysis && (
          <div className="glass-card">
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Quality Metrics</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>QA Score</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ 
                    fontSize: 32, 
                    fontWeight: 700,
                    color: getScoreColor(analysis.qa_score || 0)
                  }}>
                    {analysis.qa_score || 0}
                  </div>
                  <div style={{ flex: 1 }}>
                    <ProgressBar
                      value={analysis.qa_score || 0}
                      max={100}
                      showPercentage={false}
                      color={getScoreColor(analysis.qa_score || 0)}
                      height={6}
                      animated={false}
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>Script Adherence</div>
                <ProgressBar
                  value={analysis.script_adherence || 0}
                  max={100}
                  showPercentage={true}
                  color={getScoreColor(analysis.script_adherence || 0)}
                  height={6}
                  animated={false}
                />
              </div>
            </div>
          </div>
        )}

        {/* Flags & Reasons */}
        {analysis && (
          <div className="glass-card">
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Flags & Insights</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {analysis.reason_primary && (
                <div>
                  <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Primary Reason</div>
                  <span className="badge badge-warning">{analysis.reason_primary}</span>
                </div>
              )}
              {analysis.risk_flags && analysis.risk_flags.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Risk Flags</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {analysis.risk_flags.map((flag: string, i: number) => (
                      <span key={i} className="badge badge-error" style={{ fontSize: 11 }}>
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {call.has_policy_300_plus && (
                <span className="badge" style={{ background: '#10b981' }}>
                  💰 High Value Customer
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Recording Player */}
      {call.recording_url && (
        <div className="glass-card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Recording</h3>
          <audio 
            controls 
            style={{ 
              width: '100%', 
              maxWidth: 600,
              background: '#1a1a24',
              borderRadius: 8
            }}
          >
            <source src={call.recording_url} type="audio/mpeg" />
            <source src={call.recording_url} type="audio/wav" />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}

      {/* Tabs */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: 24 }}>
          {(['summary', 'transcript', 'analysis', 'timeline'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 20px',
                background: activeTab === tab ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #00d4ff' : '2px solid transparent',
                color: activeTab === tab ? '#00d4ff' : '#a8a8b3',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'capitalize'
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="glass-card">
          {/* Summary Tab */}
          {activeTab === 'summary' && analysis && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Call Summary</h3>
              {analysis.summary && (
                <div style={{ 
                  padding: 16, 
                  background: 'rgba(0, 212, 255, 0.1)', 
                  borderRadius: 8,
                  borderLeft: '3px solid #00d4ff',
                  marginBottom: 20
                }}>
                  <p style={{ fontSize: 14, lineHeight: 1.6 }}>{analysis.summary}</p>
                </div>
              )}

              {/* Sentiments */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {analysis.sentiment_agent !== null && (
                  <div>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>Agent Sentiment</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ 
                        width: 12, 
                        height: 12, 
                        borderRadius: '50%',
                        background: getSentimentColor(analysis.sentiment_agent)
                      }} />
                      <span>{analysis.sentiment_agent > 0.3 ? 'Positive' : 
                             analysis.sentiment_agent < -0.3 ? 'Negative' : 'Neutral'}</span>
                    </div>
                  </div>
                )}
                {analysis.sentiment_customer !== null && (
                  <div>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>Customer Sentiment</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ 
                        width: 12, 
                        height: 12, 
                        borderRadius: '50%',
                        background: getSentimentColor(analysis.sentiment_customer)
                      }} />
                      <span>{analysis.sentiment_customer > 0.3 ? 'Positive' : 
                             analysis.sentiment_customer < -0.3 ? 'Negative' : 'Neutral'}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Key Quotes */}
              {keyQuotes.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Key Quotes</h4>
                  {keyQuotes.map((q: any, i: number) => (
                    <div key={i} style={{ 
                      marginBottom: 12, 
                      paddingLeft: 16,
                      borderLeft: '2px solid rgba(124, 58, 237, 0.3)',
                      fontStyle: 'italic',
                      fontSize: 13
                    }}>
                      "{q.quote}"
                      {q.ts && (
                        <span style={{ fontSize: 11, color: '#7c3aed', marginLeft: 8 }}>
                          @ {q.ts}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Transcript Tab */}
          {activeTab === 'transcript' && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <input
                  type="text"
                  placeholder="Search in transcript..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    maxWidth: 400,
                    padding: '8px 12px',
                    background: 'rgba(20, 20, 30, 0.6)',
                    border: '1px solid rgba(0, 212, 255, 0.2)',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 14
                  }}
                />
              </div>

              {transcript ? (
                <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                  {segments.length > 0 ? (
                    <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                      {segments.map((seg: any, i: number) => (
                        <div key={i} style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 11, color: '#00d4ff', marginBottom: 4 }}>
                            {seg.speaker || `Speaker ${seg.speaker_id || i % 2}`} • 
                            {seg.start ? ` ${Math.floor(seg.start / 60)}:${(seg.start % 60).toFixed(0).padStart(2, '0')}` : ''}
                          </div>
                          <div 
                            style={{ color: '#e5e5e5' }}
                            dangerouslySetInnerHTML={{ 
                              __html: highlightText(seg.text || seg.transcript || '') 
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div 
                      style={{ fontSize: 14, lineHeight: 1.8, color: '#e5e5e5', whiteSpace: 'pre-wrap' }}
                      dangerouslySetInnerHTML={{ 
                        __html: highlightText(transcript.translated_text || transcript.text || '') 
                      }}
                    />
                  )}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#6b6b7c' }}>
                  No transcript available
                </div>
              )}
            </div>
          )}

          {/* Analysis Tab */}
          {activeTab === 'analysis' && (
            <div>
              {analysis ? (
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Analysis Details</h3>
                  <pre style={{ 
                    background: '#0a0a0f', 
                    padding: 16, 
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: '#10b981',
                    overflow: 'auto',
                    maxHeight: 500
                  }}>
                    {JSON.stringify(analysis, null, 2)}
                  </pre>
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#6b6b7c' }}>
                  No analysis available
                </div>
              )}
            </div>
          )}

          {/* Timeline Tab */}
          {activeTab === 'timeline' && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Event Timeline</h3>
              {events && events.length > 0 ? (
                <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                  {events.map((event: any) => (
                    <div key={event.id} style={{ 
                      display: 'flex', 
                      gap: 16, 
                      padding: '12px 0',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                    }}>
                      <div style={{ minWidth: 140, color: '#6b6b7c', fontSize: 12 }}>
                        {new Date(event.at).toLocaleString()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span className="badge badge-info" style={{ fontSize: 10, marginRight: 8 }}>
                          {event.type}
                        </span>
                        {event.payload && (
                          <span style={{ fontSize: 12, color: '#a8a8b3' }}>
                            {typeof event.payload === 'object' 
                              ? JSON.stringify(event.payload).substring(0, 100) + '...'
                              : event.payload}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#6b6b7c' }}>
                  No events recorded
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}