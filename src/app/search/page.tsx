'use client';
import { useState, useEffect } from 'react';
import Pagination from '@/src/components/Pagination';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [dateRange, setDateRange] = useState('all');
  const [duration, setDuration] = useState('all');
  const [disposition, setDisposition] = useState('all');
  const [agent, setAgent] = useState('all');
  const [searchType, setSearchType] = useState('smart');

  // Stats for filter counts
  const [filterStats, setFilterStats] = useState({
    totalResults: 0,
    dateFiltered: 0,
    dispositions: [] as string[],
    agents: [] as string[]
  });

  const limit = 20;

  // Predefined search templates
  const searchTemplates = [
    { label: 'Unhappy Customers', query: 'upset angry frustrated complaint problem', icon: '😤' },
    { label: 'Payment Issues', query: 'payment billing charge credit card declined', icon: '💳' },
    { label: 'Technical Problems', query: 'technical issue bug error not working broken', icon: '🔧' },
    { label: 'Cancellations', query: 'cancel refund return stop service end subscription', icon: '🚫' },
    { label: 'Sales Opportunities', query: 'interested upgrade additional features pricing plans', icon: '💰' },
    { label: 'Happy Customers', query: 'thank you excellent great wonderful happy satisfied', icon: '😊' }
  ];

  useEffect(() => {
    // Load available agents and dispositions for filters
    fetch('/api/ui/stats/safe')
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          // This would ideally come from the API
          setFilterStats(prev => ({
            ...prev,
            dispositions: ['Completed', 'No Answer', 'Busy', 'Failed', 'Voicemail'],
            agents: ['Agent Smith', 'Agent Johnson', 'Agent Brown'] // Example agents
          }));
        }
      })
      .catch(() => {});
  }, []);

  async function search(newOffset = 0) {
    if (!q.trim() && searchType !== 'recent') return;

    setLoading(true);
    setSearched(true);
    try {
      // Build search query with filters
      const searchParams: any = {
        q: searchType === 'recent' ? '' : q,
        limit,
        offset: newOffset
      };

      // Apply filters
      if (dateRange !== 'all') {
        const now = new Date();
        let startDate = new Date();

        switch(dateRange) {
          case 'today':
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startDate.setDate(now.getDate() - 7);
            break;
          case 'month':
            startDate.setMonth(now.getMonth() - 1);
            break;
          case 'quarter':
            startDate.setMonth(now.getMonth() - 3);
            break;
        }
        searchParams.startDate = startDate.toISOString();
      }

      if (duration !== 'all') {
        switch(duration) {
          case 'short':
            searchParams.maxDuration = 60; // Under 1 minute
            break;
          case 'medium':
            searchParams.minDuration = 60;
            searchParams.maxDuration = 300; // 1-5 minutes
            break;
          case 'long':
            searchParams.minDuration = 300; // Over 5 minutes
            break;
        }
      }

      if (disposition !== 'all') {
        searchParams.disposition = disposition;
      }

      if (agent !== 'all') {
        searchParams.agent = agent;
      }

      const r = await fetch('/api/ui/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchParams)
      });
      const j = await r.json();
      setResults(j.data || []);
      setTotal(j.total || 0);
      setOffset(newOffset);
      setFilterStats(prev => ({ ...prev, totalResults: j.total || 0 }));
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

  const handleTemplateSearch = (query: string) => {
    setQ(query);
    setSearchType('smart');
    setTimeout(() => {
      search(0);
    }, 100);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getDispositionColor = (disp: string) => {
    const colors: Record<string, string> = {
      'Completed': '#10b981',
      'No Answer': '#f59e0b',
      'Busy': '#ef4444',
      'Failed': '#ef4444',
      'Voicemail': '#00d4ff'
    };
    return colors[disp] || '#6b6b7c';
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
          Advanced Search & Analytics
        </h1>
        <p style={{ color: '#6b6b7c', fontSize: 14 }}>
          Powerful semantic search with AI-driven insights across all communications
        </p>
      </div>

      {/* Quick Search Templates */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Quick Searches
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {searchTemplates.map((template, i) => (
            <button
              key={i}
              onClick={() => handleTemplateSearch(template.query)}
              className="btn btn-ghost"
              style={{
                padding: '8px 16px',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 20,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span style={{ fontSize: 16 }}>{template.icon}</span>
              {template.label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Search Bar */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 32 }}>
        {/* Search Type Selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { value: 'smart', label: '🧠 Smart Search', desc: 'AI-powered semantic search' },
            { value: 'exact', label: '🔤 Exact Match', desc: 'Find exact phrases' },
            { value: 'recent', label: '🕐 Recent Calls', desc: 'Browse latest calls' }
          ].map(type => (
            <button
              key={type.value}
              onClick={() => setSearchType(type.value)}
              style={{
                flex: 1,
                padding: '12px 16px',
                background: searchType === type.value ? 'rgba(0, 212, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                border: searchType === type.value ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{type.label}</div>
              <div style={{ fontSize: 11, color: '#6b6b7c' }}>{type.desc}</div>
            </button>
          ))}
        </div>

        {/* Main Search Input */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
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
              placeholder={searchType === 'recent' ? 'Press search to view recent calls...' : 'Enter your search query...'}
              disabled={searchType === 'recent'}
              style={{
                width: '100%',
                padding: '14px 16px 14px 48px',
                background: searchType === 'recent' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                color: '#ffffff',
                fontSize: 14,
                outline: 'none',
                transition: 'all 0.2s',
                opacity: searchType === 'recent' ? 0.5 : 1
              }}
              onFocus={(e) => {
                if (searchType !== 'recent') {
                  e.target.style.borderColor = 'rgba(0, 212, 255, 0.5)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.08)';
                }
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.target.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn btn-ghost"
            style={{
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: showFilters ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
              borderColor: showFilters ? 'rgba(124, 58, 237, 0.3)' : 'rgba(255, 255, 255, 0.1)'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filters
            {(dateRange !== 'all' || duration !== 'all' || disposition !== 'all' || agent !== 'all') && (
              <span style={{
                padding: '2px 6px',
                background: '#7c3aed',
                borderRadius: 10,
                fontSize: 10,
                fontWeight: 600
              }}>
                Active
              </span>
            )}
          </button>

          <button
            onClick={handleSearch}
            disabled={loading || (!q.trim() && searchType !== 'recent')}
            className="btn btn-primary"
            style={{
              minWidth: 120,
              opacity: loading || (!q.trim() && searchType !== 'recent') ? 0.5 : 1,
              cursor: loading || (!q.trim() && searchType !== 'recent') ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            {loading ? (
              <span className="pulse">Searching...</span>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                Search
              </>
            )}
          </button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div style={{
            padding: '16px',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {/* Date Range Filter */}
              <div>
                <label style={{ fontSize: 11, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
                  Date Range
                </label>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all" style={{ background: '#14141f' }}>All Time</option>
                  <option value="today" style={{ background: '#14141f' }}>Today</option>
                  <option value="week" style={{ background: '#14141f' }}>Last 7 Days</option>
                  <option value="month" style={{ background: '#14141f' }}>Last 30 Days</option>
                  <option value="quarter" style={{ background: '#14141f' }}>Last 3 Months</option>
                </select>
              </div>

              {/* Duration Filter */}
              <div>
                <label style={{ fontSize: 11, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
                  Call Duration
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all" style={{ background: '#14141f' }}>Any Duration</option>
                  <option value="short" style={{ background: '#14141f' }}>Short (&lt; 1 min)</option>
                  <option value="medium" style={{ background: '#14141f' }}>Medium (1-5 min)</option>
                  <option value="long" style={{ background: '#14141f' }}>Long (&gt; 5 min)</option>
                </select>
              </div>

              {/* Disposition Filter */}
              <div>
                <label style={{ fontSize: 11, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
                  Call Status
                </label>
                <select
                  value={disposition}
                  onChange={(e) => setDisposition(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all" style={{ background: '#14141f' }}>All Statuses</option>
                  {filterStats.dispositions.map(disp => (
                    <option key={disp} value={disp} style={{ background: '#14141f' }}>{disp}</option>
                  ))}
                </select>
              </div>

              {/* Agent Filter */}
              <div>
                <label style={{ fontSize: 11, color: '#6b6b7c', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
                  Agent
                </label>
                <select
                  value={agent}
                  onChange={(e) => setAgent(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all" style={{ background: '#14141f' }}>All Agents</option>
                  {filterStats.agents.map(ag => (
                    <option key={ag} value={ag} style={{ background: '#14141f' }}>{ag}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Clear Filters */}
            {(dateRange !== 'all' || duration !== 'all' || disposition !== 'all' || agent !== 'all') && (
              <button
                onClick={() => {
                  setDateRange('all');
                  setDuration('all');
                  setDisposition('all');
                  setAgent('all');
                }}
                className="btn btn-ghost"
                style={{
                  marginTop: 16,
                  fontSize: 12,
                  padding: '6px 12px'
                }}
              >
                Clear All Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results Section */}
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
                {searchType === 'recent' ? 'Recent Calls' : 'Search Results'}
              </h2>
              <p style={{ fontSize: 12, color: '#6b6b7c' }}>
                {loading ? 'Searching...' : (
                  searchType === 'recent'
                    ? `Showing ${results.length} recent calls`
                    : `Found ${total} matching calls for "${q}"`
                )}
              </p>
            </div>
            {total > 0 && searchType !== 'recent' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{
                  padding: '6px 12px',
                  background: 'rgba(0, 212, 255, 0.1)',
                  border: '1px solid rgba(0, 212, 255, 0.3)',
                  borderRadius: 16,
                  fontSize: 12,
                  color: '#00d4ff'
                }}>
                  {searchType === 'smart' ? '🧠 AI Relevance' : '🔤 Exact Match'}
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  width: 60,
                  height: 60,
                  margin: '0 auto',
                  border: '3px solid rgba(0, 212, 255, 0.2)',
                  borderTop: '3px solid #00d4ff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              </div>
              <div className="pulse" style={{ color: '#6b6b7c' }}>
                Analyzing {searchType === 'smart' ? 'semantically' : 'precisely'} across all transcripts...
              </div>
            </div>
          ) : results.length > 0 ? (
            <>
              <div style={{ padding: '0 24px' }}>
                {results.map((r: any, index: number) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '24px 0',
                      borderBottom: index < results.length - 1 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      position: 'relative'
                    }}
                    onClick={() => window.location.href = `/call/${r.id}`}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      e.currentTarget.style.paddingLeft = '8px';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.paddingLeft = '0';
                    }}
                  >
                    <div style={{ display: 'flex', gap: 20 }}>
                      {/* Score Indicator */}
                      {r.score && searchType === 'smart' && (
                        <div style={{
                          minWidth: 60,
                          textAlign: 'center'
                        }}>
                          <div style={{
                            width: 60,
                            height: 60,
                            borderRadius: '50%',
                            background: `conic-gradient(#00d4ff ${r.score * 360}deg, rgba(255,255,255,0.1) 0deg)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative'
                          }}>
                            <div style={{
                              width: 50,
                              height: 50,
                              borderRadius: '50%',
                              background: '#0a0a0f',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 16,
                              fontWeight: 600,
                              color: '#00d4ff'
                            }}>
                              {(r.score * 100).toFixed(0)}%
                            </div>
                          </div>
                          <div style={{ fontSize: 10, color: '#6b6b7c', marginTop: 4 }}>
                            Match Score
                          </div>
                        </div>
                      )}

                      {/* Main Content */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                              {new Date(r.started_at).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                            <span style={{ fontSize: 12, color: '#6b6b7c' }}>
                              {new Date(r.started_at).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>

                          {r.agent && (
                            <div style={{
                              padding: '4px 10px',
                              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(0, 212, 255, 0.2))',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 500
                            }}>
                              👤 {r.agent}
                            </div>
                          )}

                          {r.disposition && (
                            <span style={{
                              padding: '4px 10px',
                              background: `${getDispositionColor(r.disposition)}20`,
                              color: getDispositionColor(r.disposition),
                              border: `1px solid ${getDispositionColor(r.disposition)}40`,
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 500
                            }}>
                              {r.disposition}
                            </span>
                          )}

                          {r.duration_sec && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 10px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              borderRadius: 6,
                              fontSize: 11
                            }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              {formatDuration(r.duration_sec)}
                            </div>
                          )}
                        </div>

                        {(r.reason_primary || r.reason_secondary) && (
                          <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {r.reason_primary && (
                              <span style={{
                                padding: '6px 12px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: 8,
                                fontSize: 12,
                                color: '#a8a8b3',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                              }}>
                                <span style={{ opacity: 0.5 }}>📌</span>
                                {r.reason_primary}
                              </span>
                            )}
                            {r.reason_secondary && (
                              <span style={{
                                padding: '6px 12px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: 8,
                                fontSize: 12,
                                color: '#6b6b7c'
                              }}>
                                {r.reason_secondary}
                              </span>
                            )}
                          </div>
                        )}

                        {r.summary && (
                          <div style={{
                            padding: '12px 16px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            borderLeft: '2px solid rgba(0, 212, 255, 0.3)',
                            borderRadius: '0 6px 6px 0',
                            marginBottom: 12
                          }}>
                            <p style={{
                              fontSize: 13,
                              color: '#a8a8b3',
                              lineHeight: 1.6,
                              margin: 0
                            }}>
                              {r.summary}
                            </p>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-ghost"
                            style={{
                              padding: '6px 12px',
                              fontSize: 12,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = `/call/${r.id}`;
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            View Details
                          </button>
                          {r.recording_url && (
                            <button
                              className="btn btn-ghost"
                              style={{
                                padding: '6px 12px',
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(r.recording_url, '_blank');
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                              Play Recording
                            </button>
                          )}
                        </div>
                      </div>
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
            <div style={{ padding: 60, textAlign: 'center' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 16px', opacity: 0.3 }}>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
                <path d="M8 11h6" />
              </svg>
              <div style={{ fontSize: 18, fontWeight: 500, color: '#fff', marginBottom: 8 }}>
                No results found
              </div>
              <div style={{ color: '#6b6b7c', fontSize: 14 }}>
                {searchType === 'recent'
                  ? 'No recent calls available'
                  : `No calls matching "${q}" with current filters`}
              </div>
              <div style={{ color: '#6b6b7c', fontSize: 12, marginTop: 12 }}>
                Try adjusting your search terms or clearing some filters
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Floating Help Button */}
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        alignItems: 'flex-end'
      }}>
        {searched && total > 0 && (
          <div style={{
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
            <span>Search Results</span>
            <span style={{ color: '#00d4ff', fontWeight: 600 }}>
              {total} Matches
            </span>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}