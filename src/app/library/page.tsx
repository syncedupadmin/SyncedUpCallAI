'use client';
import { useState, useEffect } from 'react';
import useSWR from 'swr';

export default function LibraryPage() {
  const { data, error, isLoading } = useSWR('/api/ui/library/simple', url => fetch(url).then(r => r.json()));
  const [activeTab, setActiveTab] = useState<'best' | 'worst' | 'recent'>('best');

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="fade-in" style={{ padding: '40px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
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
          Call Library
        </h1>
        <p style={{ color: '#6b6b7c', fontSize: 14 }}>
          Curated collection of notable calls for training and quality assurance
        </p>
      </div>

      {/* Stats Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 24,
        marginBottom: 32
      }}>
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span style={{ fontSize: 12, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Top Performers
            </span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#10b981' }}>
            {data?.best?.length || 0}
          </div>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>
            Calls with QA score ≥ 80
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ fontSize: 12, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Needs Improvement
            </span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#ef4444' }}>
            {data?.worst?.length || 0}
          </div>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>
            Calls with QA score &lt; 50
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span style={{ fontSize: 12, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Average Score
            </span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#00d4ff' }}>
            {data?.avgScore?.toFixed(1) || '0'}
          </div>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>
            Overall QA performance
          </div>
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
              <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span style={{ fontSize: 12, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Analyzed
            </span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#7c3aed' }}>
            {(data?.best?.length || 0) + (data?.worst?.length || 0)}
          </div>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>
            Calls in library
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: 8,
        marginBottom: 24,
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: 0
      }}>
        {[
          { key: 'best', label: 'Top Performers', icon: '⭐', color: '#10b981' },
          { key: 'worst', label: 'Needs Improvement', icon: '⚠️', color: '#ef4444' },
          { key: 'recent', label: 'Recent Calls', icon: '🕐', color: '#00d4ff' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: '12px 20px',
              background: activeTab === tab.key ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
              color: activeTab === tab.key ? '#ffffff' : '#6b6b7c',
              fontSize: 14,
              fontWeight: activeTab === tab.key ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: -1,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.key) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.key) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="pulse" style={{ color: '#6b6b7c' }}>Loading call library...</div>
          </div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
            Failed to load library data
          </div>
        ) : (
          <div>
            {/* Tab Content */}
            {activeTab === 'best' && (
              <CallList 
                calls={data?.best || []} 
                title="Top Performing Calls"
                emptyMessage="No high-scoring calls found yet"
                formatDuration={formatDuration}
                getScoreColor={getScoreColor}
              />
            )}
            
            {activeTab === 'worst' && (
              <CallList 
                calls={data?.worst || []} 
                title="Calls Needing Improvement"
                emptyMessage="No low-scoring calls found"
                formatDuration={formatDuration}
                getScoreColor={getScoreColor}
              />
            )}
            
            {activeTab === 'recent' && (
              <CallList 
                calls={data?.recent || []} 
                title="Recent Analyzed Calls"
                emptyMessage="No recent calls analyzed"
                formatDuration={formatDuration}
                getScoreColor={getScoreColor}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CallList({ calls, title, emptyMessage, formatDuration, getScoreColor }: any) {
  if (!calls || calls.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b6b7c' }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      <div style={{ 
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h3>
        <p style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>
          {calls.length} calls in this category
        </p>
      </div>
      
      <div style={{ padding: '0 24px' }}>
        {calls.map((call: any, index: number) => (
          <div 
            key={call.id}
            style={{ 
              padding: '20px 0',
              borderBottom: index < calls.length - 1 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onClick={() => window.location.href = `/call/${call.id}`}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
              e.currentTarget.style.paddingLeft = '12px';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.paddingLeft = '0';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {new Date(call.started_at).toLocaleDateString()} {new Date(call.started_at).toLocaleTimeString()}
                  </span>
                  {call.agent && (
                    <span style={{ 
                      padding: '2px 8px',
                      background: 'rgba(124, 58, 237, 0.2)',
                      borderRadius: 4,
                      fontSize: 11,
                      color: '#a78bfa'
                    }}>
                      {call.agent}
                    </span>
                  )}
                  {call.duration_sec && (
                    <span style={{ fontSize: 12, color: '#6b6b7c' }}>
                      {formatDuration(call.duration_sec)}
                    </span>
                  )}
                  {call.campaign && (
                    <span style={{ 
                      padding: '2px 8px',
                      background: 'rgba(0, 212, 255, 0.1)',
                      borderRadius: 4,
                      fontSize: 11,
                      color: '#00d4ff'
                    }}>
                      {call.campaign}
                    </span>
                  )}
                </div>
                
                {call.reason_primary && (
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ 
                      padding: '4px 10px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#a8a8b3'
                    }}>
                      {call.reason_primary}
                    </span>
                    {call.reason_secondary && (
                      <span style={{ 
                        marginLeft: 8,
                        padding: '4px 10px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 6,
                        fontSize: 12,
                        color: '#6b6b7c'
                      }}>
                        {call.reason_secondary}
                      </span>
                    )}
                  </div>
                )}
                
                {call.summary && (
                  <p style={{ 
                    fontSize: 13, 
                    color: '#a8a8b3',
                    lineHeight: 1.5,
                    marginBottom: 0,
                    maxWidth: '80%'
                  }}>
                    {call.summary}
                  </p>
                )}
                
                {call.risk_flags && call.risk_flags.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    {call.risk_flags.map((flag: string, i: number) => (
                      <span key={i} style={{
                        padding: '2px 8px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 4,
                        fontSize: 11,
                        color: '#f87171'
                      }}>
                        {flag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              {call.qa_score !== undefined && (
                <div style={{ 
                  minWidth: 80,
                  textAlign: 'center',
                  padding: '12px',
                  background: `${getScoreColor(call.qa_score)}20`,
                  border: `1px solid ${getScoreColor(call.qa_score)}40`,
                  borderRadius: 8
                }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: getScoreColor(call.qa_score) }}>
                    {call.qa_score}
                  </div>
                  <div style={{ fontSize: 10, color: '#6b6b7c', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    QA Score
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}