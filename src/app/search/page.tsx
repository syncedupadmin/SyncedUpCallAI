'use client';
import { useState } from 'react';
import Pagination from '@/src/components/Pagination';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const limit = 20;
  
  async function search(newOffset = 0) {
    if (!q.trim()) return;
    
    setLoading(true);
    setSearched(true);
    try {
      const r = await fetch('/api/ui/search', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ q, limit, offset: newOffset }) 
      });
      const j = await r.json(); 
      setResults(j.data || []);
      setTotal(j.total || 0);
      setOffset(newOffset);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }
  
  const handlePageChange = (newOffset: number) => {
    search(newOffset);
  };
  
  const handleSearch = () => {
    setOffset(0);
    search(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
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
          Semantic Search
        </h1>
        <p style={{ color: '#6b6b7c', fontSize: 14 }}>
          Search across all call transcripts and analyses using natural language
        </p>
      </div>

      {/* Search Bar */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 32 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              style={{
                position: 'absolute',
                left: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#6b6b7c'
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input 
              value={q} 
              onChange={e => setQ(e.target.value)} 
              onKeyPress={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search for topics, issues, customer concerns..."
              style={{
                width: '100%',
                padding: '12px 16px 12px 48px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                color: '#ffffff',
                fontSize: 14,
                outline: 'none',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(0, 212, 255, 0.5)';
                e.target.style.background = 'rgba(255, 255, 255, 0.08)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.target.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
            />
          </div>
          <button 
            onClick={handleSearch} 
            disabled={loading || !q.trim()}
            className="btn btn-primary"
            style={{ 
              minWidth: 120,
              opacity: loading || !q.trim() ? 0.5 : 1,
              cursor: loading || !q.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? (
              <span className="pulse">Searching...</span>
            ) : (
              'Search'
            )}
          </button>
        </div>
        
        {/* Search Suggestions */}
        {!searched && (
          <div style={{ marginTop: 16, fontSize: 12, color: '#6b6b7c' }}>
            <span>Try searching for: </span>
            {['payment issues', 'customer complaints', 'technical problems', 'billing questions'].map((suggestion, i) => (
              <span key={i}>
                <a 
                  onClick={() => { setQ(suggestion); search(0); }}
                  style={{ 
                    color: '#00d4ff', 
                    cursor: 'pointer',
                    textDecoration: 'none',
                    marginRight: 8
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                >
                  {suggestion}
                </a>
                {i < 3 && ' • '}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {searched && (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ 
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                Search Results
              </h2>
              <p style={{ fontSize: 12, color: '#6b6b7c' }}>
                {loading ? 'Searching...' : `Found ${total} matching calls`}
              </p>
            </div>
            {total > 0 && (
              <div style={{ 
                padding: '6px 12px',
                background: 'rgba(0, 212, 255, 0.1)',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                borderRadius: 16,
                fontSize: 12,
                color: '#00d4ff'
              }}>
                Relevance Score
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div className="pulse" style={{ color: '#6b6b7c' }}>
                Searching through call transcripts...
              </div>
            </div>
          ) : results.length > 0 ? (
            <>
              <div style={{ padding: '0 24px' }}>
                {results.map((r: any, index: number) => (
                  <div 
                    key={r.id}
                    style={{ 
                      padding: '20px 0',
                      borderBottom: index < results.length - 1 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => window.location.href = `/call/${r.id}`}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      e.currentTarget.style.marginLeft = '4px';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.marginLeft = '0';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>
                            {new Date(r.started_at).toLocaleDateString()} {new Date(r.started_at).toLocaleTimeString()}
                          </span>
                          {r.agent && (
                            <span style={{ 
                              padding: '2px 8px',
                              background: 'rgba(124, 58, 237, 0.2)',
                              borderRadius: 4,
                              fontSize: 11,
                              color: '#a78bfa'
                            }}>
                              {r.agent}
                            </span>
                          )}
                          {r.duration_sec && (
                            <span style={{ fontSize: 12, color: '#6b6b7c' }}>
                              {formatDuration(r.duration_sec)}
                            </span>
                          )}
                        </div>
                        
                        {r.reason_primary && (
                          <div style={{ marginBottom: 8 }}>
                            <span style={{ 
                              padding: '4px 10px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: 6,
                              fontSize: 12,
                              color: '#a8a8b3'
                            }}>
                              {r.reason_primary}
                            </span>
                            {r.reason_secondary && (
                              <span style={{ 
                                marginLeft: 8,
                                padding: '4px 10px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: 6,
                                fontSize: 12,
                                color: '#6b6b7c'
                              }}>
                                {r.reason_secondary}
                              </span>
                            )}
                          </div>
                        )}
                        
                        {r.summary && (
                          <p style={{ 
                            fontSize: 13, 
                            color: '#a8a8b3',
                            lineHeight: 1.5,
                            marginBottom: 0
                          }}>
                            {r.summary}
                          </p>
                        )}
                      </div>
                      
                      {r.score && (
                        <div style={{ 
                          minWidth: 80,
                          textAlign: 'center',
                          padding: '8px 12px',
                          background: `rgba(0, 212, 255, ${r.score * 0.3})`,
                          border: '1px solid rgba(0, 212, 255, 0.3)',
                          borderRadius: 8
                        }}>
                          <div style={{ fontSize: 18, fontWeight: 600, color: '#00d4ff' }}>
                            {(r.score * 100).toFixed(0)}%
                          </div>
                          <div style={{ fontSize: 10, color: '#6b6b7c', marginTop: 2 }}>
                            Match
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <Pagination
                  total={total}
                  limit={limit}
                  offset={offset}
                  onPageChange={handlePageChange}
                  loading={loading}
                />
              </div>
            </>
          ) : searched && !loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto 16px', opacity: 0.3 }}>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
                <path d="M8 11h6" />
              </svg>
              <div style={{ color: '#6b6b7c', fontSize: 14 }}>
                No results found for "{q}"
              </div>
              <div style={{ color: '#6b6b7c', fontSize: 12, marginTop: 8 }}>
                Try different keywords or search terms
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}