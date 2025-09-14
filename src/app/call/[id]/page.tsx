'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function CallDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  const [triggerBusy, setTriggerBusy] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedText, setHighlightedText] = useState('');
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ui/call/${params.id}`)
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
        fetch(`/api/ui/call/${params.id}`)
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

  const triggerJob = async (job: 'transcribe' | 'analyze') => {
    setTriggerBusy(job);
    try {
      const res = await fetch(`/api/ui/trigger/${job}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: params.id })
      });
      if (res.ok) {
        // Refresh data
        const refreshRes = await fetch(`/api/ui/call/${params.id}`);
        const refreshData = await refreshRes.json();
        setData(refreshData);
      }
    } catch (err) {
      console.error(`Failed to trigger ${job}:`, err);
    } finally {
      setTriggerBusy(null);
    }
  };

  // Process transcript with search highlighting - must be before conditional returns
  const processedTranscript = useMemo(() => {
    if (!data?.transcript?.text) return '';
    const textToProcess = showOriginal && data.transcript.text ?
      data.transcript.text :
      (data.transcript.translated_text || data.transcript.text);
    return highlightText(textToProcess, searchQuery);
  }, [data, showOriginal, searchQuery]);

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

  const { call, transcript, analysis, events } = data;

  // Parse diarized data if available
  let diarizedSegments = [];
  if (transcript?.diarized) {
    try {
      diarizedSegments = JSON.parse(transcript.diarized);
    } catch {}
  }

  // Parse key quotes
  let keyQuotes = [];
  if (analysis?.key_quotes) {
    try {
      keyQuotes = JSON.parse(analysis.key_quotes);
    } catch {}
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSentimentColor = (sentiment: number) => {
    if (sentiment > 0.3) return '#10b981';
    if (sentiment < -0.3) return '#ef4444';
    return '#6b6b7c';
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  // Highlight search query in transcript
  const highlightText = (text: string, query: string) => {
    if (!query || query.length < 2) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, i) => 
      regex.test(part) ? 
        `<mark style="background: #fbbf24; color: #000; padding: 2px 0">${part}</mark>` : 
        part
    ).join('');
  };


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
            <span className="badge badge-warning pulse" style={{ 
              animation: 'pulse 1.5s ease-in-out infinite' 
            }}>
              {liveStatus === 'transcribing' && '🎤 Transcribing...'}
              {liveStatus === 'analyzing' && '🤖 Analyzing...'}
              {liveStatus === 'done' && '✅ Complete'}
              {liveStatus === 'error' && '❌ Error'}
            </span>
          )}
        </div>
      </div>

      {/* Call Info Card */}
      <div className="glass-card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Call Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Agent</div>
            <div style={{ fontWeight: 500 }}>{call.agent_name || 'Unknown'}</div>
            {call.agent_team && (
              <div style={{ fontSize: 12, color: '#6b6b7c' }}>Team: {call.agent_team}</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Customer</div>
            <div style={{ fontWeight: 500 }}>{call.customer_phone || 'Unknown'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Campaign</div>
            <div style={{ fontWeight: 500 }}>{call.campaign || 'N/A'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Direction</div>
            <div style={{ fontWeight: 500 }}>{call.direction || 'outbound'}</div>
          </div>
        </div>

        {/* Audio Player */}
        {call.recording_url && (
          <div style={{ marginTop: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>Recording</div>
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

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          {call.recording_url && (
            <a 
              href={call.recording_url} 
              target="_blank" 
              className="btn btn-ghost"
              style={{ fontSize: 14 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download
            </a>
          )}
          
          <button
            onClick={() => triggerJob('transcribe')}
            disabled={!!transcript || triggerBusy !== null}
            className="btn btn-ghost"
            style={{ fontSize: 14, opacity: (!!transcript || triggerBusy !== null) ? 0.5 : 1 }}
          >
            {triggerBusy === 'transcribe' ? (
              <span className="pulse">Processing...</span>
            ) : (
              transcript ? 'Transcribed ✓' : 'Transcribe'
            )}
          </button>
          
          <button
            onClick={() => triggerJob('analyze')}
            disabled={!transcript || !!analysis || triggerBusy !== null}
            className="btn btn-ghost"
            style={{ fontSize: 14, opacity: (!transcript || !!analysis || triggerBusy !== null) ? 0.5 : 1 }}
          >
            {triggerBusy === 'analyze' ? (
              <span className="pulse">Processing...</span>
            ) : (
              analysis ? 'Analyzed ✓' : 'Analyze'
            )}
          </button>
          
          {transcript && (
            <a 
              href={`/api/ui/call/export?id=${params.id}&format=txt`}
              download
              className="btn btn-ghost"
              style={{ fontSize: 14 }}
            >
              📥 Download Transcript
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Left Column - Transcript */}
        <div>
          <div className="glass-card">
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Transcript</h3>
                {transcript?.translated_text && transcript.lang !== 'en' && (
                  <button
                    onClick={() => setShowOriginal(!showOriginal)}
                    className="btn btn-ghost"
                    style={{ fontSize: 12 }}
                  >
                    {showOriginal ? 'Show English' : 'Show Original'}
                  </button>
                )}
              </div>
              
              {/* Search box */}
              {transcript && (
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search in transcript..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 36px 8px 12px',
                      background: 'rgba(20, 20, 30, 0.6)',
                      border: '1px solid rgba(0, 212, 255, 0.2)',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 14
                    }}
                  />
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                    style={{ 
                      position: 'absolute', 
                      right: 12, 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      opacity: 0.5
                    }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </div>
              )}
            </div>

            {!transcript ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#6b6b7c' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3, margin: '0 auto 16px' }}>
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                <div>No transcript available</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>Click "Transcribe" to generate</div>
              </div>
            ) : (
              <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                {diarizedSegments.length > 0 ? (
                  <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                    {diarizedSegments.map((seg: any, i: number) => {
                      const segmentText = seg.text || seg.transcript || '';
                      const highlighted = highlightText(segmentText, searchQuery);
                      return (
                        <div key={i} style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, color: '#00d4ff', marginBottom: 4 }}>
                            {seg.speaker || `Speaker ${seg.speaker_id || i % 2}`} • {seg.start ? `${Math.floor(seg.start / 60)}:${(seg.start % 60).toFixed(0).padStart(2, '0')}` : ''}
                          </div>
                          <div 
                            style={{ color: '#e5e5e5' }}
                            dangerouslySetInnerHTML={{ __html: highlighted }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div 
                    style={{ fontSize: 14, lineHeight: 1.8, color: '#e5e5e5', whiteSpace: 'pre-wrap' }}
                    dangerouslySetInnerHTML={{ __html: processedTranscript }}
                  />
                )}
                
                {transcript.engine && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: '#6b6b7c' }}>
                    Transcribed by {transcript.engine} • {transcript.lang || 'en'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Analysis */}
        <div>
          <div className="glass-card">
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Analysis</h3>

            {!analysis ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#6b6b7c' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3, margin: '0 auto 16px' }}>
                  <path d="M9 11H3v2h6v-2zm0-4H3v2h6V7zm0 8H3v2h6v-2zm12-8h-6v2h6V7zm0 4h-6v2h6v-2zm0 4h-6v2h6v-2z" />
                </svg>
                <div>No analysis available</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>Transcribe first, then analyze</div>
              </div>
            ) : (
              <div>
                {/* Summary */}
                {analysis.summary && (
                  <div style={{ marginBottom: 20, padding: 16, background: 'rgba(0, 212, 255, 0.1)', borderRadius: 8, borderLeft: '3px solid #00d4ff' }}>
                    <div style={{ fontSize: 12, color: '#00d4ff', marginBottom: 8, fontWeight: 600 }}>Summary</div>
                    <div style={{ fontSize: 14, lineHeight: 1.6 }}>{analysis.summary}</div>
                  </div>
                )}

                {/* Scores */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>QA Score</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ 
                        fontSize: 24, 
                        fontWeight: 700,
                        color: getScoreColor(analysis.qa_score || 0)
                      }}>
                        {analysis.qa_score || 0}
                      </div>
                      <div style={{ flex: 1, height: 4, background: '#1a1a24', borderRadius: 4 }}>
                        <div style={{ 
                          width: `${analysis.qa_score || 0}%`,
                          height: '100%',
                          background: getScoreColor(analysis.qa_score || 0),
                          borderRadius: 4
                        }} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>Script Adherence</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ 
                        fontSize: 24, 
                        fontWeight: 700,
                        color: getScoreColor(analysis.script_adherence || 0)
                      }}>
                        {analysis.script_adherence || 0}
                      </div>
                      <div style={{ flex: 1, height: 4, background: '#1a1a24', borderRadius: 4 }}>
                        <div style={{ 
                          width: `${analysis.script_adherence || 0}%`,
                          height: '100%',
                          background: getScoreColor(analysis.script_adherence || 0),
                          borderRadius: 4
                        }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Reason */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>Call Reason</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge badge-warning" style={{ fontSize: 13 }}>
                      {analysis.reason_primary}
                    </span>
                    {analysis.reason_secondary && (
                      <span style={{ fontSize: 12, color: '#a8a8b3' }}>
                        {analysis.reason_secondary}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sentiments */}
                {(analysis.sentiment_agent !== null || analysis.sentiment_customer !== null) && (
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
                          <span style={{ fontSize: 14 }}>
                            {analysis.sentiment_agent > 0.3 ? 'Positive' : 
                             analysis.sentiment_agent < -0.3 ? 'Negative' : 'Neutral'}
                          </span>
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
                          <span style={{ fontSize: 14 }}>
                            {analysis.sentiment_customer > 0.3 ? 'Positive' : 
                             analysis.sentiment_customer < -0.3 ? 'Negative' : 'Neutral'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Risk Flags */}
                {analysis.risk_flags && analysis.risk_flags.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>Risk Flags</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {analysis.risk_flags.map((flag: string) => (
                        <span key={flag} className="badge badge-error">
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Quotes */}
                {keyQuotes.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>Key Quotes</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                      {keyQuotes.map((q: any, i: number) => (
                        <div key={i} style={{ 
                          marginBottom: 12, 
                          paddingLeft: 16,
                          borderLeft: '2px solid rgba(124, 58, 237, 0.3)',
                          fontStyle: 'italic',
                          color: '#e5e5e5'
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
                  </div>
                )}

                {/* Model Info */}
                {analysis.model && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: '#6b6b7c' }}>
                    Analyzed by {analysis.model} • Confidence: {((analysis.confidence || 0) * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Events Timeline */}
          {events && events.length > 0 && (
            <div className="glass-card" style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Event Timeline</h3>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {events.slice(0, 10).map((event: any) => (
                  <div key={event.id} style={{ 
                    display: 'flex', 
                    gap: 12, 
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    fontSize: 12
                  }}>
                    <div style={{ color: '#6b6b7c', minWidth: 60 }}>
                      {new Date(event.at).toLocaleTimeString()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span className="badge badge-info" style={{ fontSize: 10 }}>
                        {event.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}