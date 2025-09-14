'use client';

import { useState, useEffect } from 'react';
import Pagination from '@/src/components/Pagination';
import FiltersBar, { SelectFilter } from '@/src/ui/FiltersBar';
import Badge from '@/src/ui/Badge';
import EmptyState from '@/src/ui/EmptyState';
import { tokens } from '@/src/ui/tokens';
import {
  Search,
  AlertCircle,
  CreditCard,
  Wrench,
  Ban,
  DollarSign,
  Smile,
  Brain,
  Type,
  Clock as ClockIcon,
  Filter,
  Calendar,
  User,
  Phone,
  Eye,
  Play,
  HelpCircle
} from '@/src/ui/icons';

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
    { label: 'Unhappy Customers', query: 'upset angry frustrated complaint problem', icon: <AlertCircle size={16} /> },
    { label: 'Payment Issues', query: 'payment billing charge credit card declined', icon: <CreditCard size={16} /> },
    { label: 'Technical Problems', query: 'technical issue bug error not working broken', icon: <Wrench size={16} /> },
    { label: 'Cancellations', query: 'cancel refund return stop service end subscription', icon: <Ban size={16} /> },
    { label: 'Sales Opportunities', query: 'interested upgrade additional features pricing plans', icon: <DollarSign size={16} /> },
    { label: 'Happy Customers', query: 'thank you excellent great wonderful happy satisfied', icon: <Smile size={16} /> }
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

  return (
    <div style={{ padding: tokens.spacing['3xl'], maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: tokens.spacing['3xl'] }}>
        <h1 style={{
          fontSize: tokens.typography.fontSize['3xl'],
          fontWeight: tokens.typography.fontWeight.bold,
          color: tokens.colors.text,
          marginBottom: tokens.spacing.sm
        }}>
          Advanced Search
        </h1>
        <p style={{
          color: tokens.colors.textSecondary,
          fontSize: tokens.typography.fontSize.md
        }}>
          Powerful semantic search with AI-driven insights across all communications
        </p>
      </div>

      {/* Quick Search Templates */}
      <div style={{ marginBottom: tokens.spacing.lg }}>
        <div style={{
          fontSize: tokens.typography.fontSize.xs,
          color: tokens.colors.textTertiary,
          marginBottom: tokens.spacing.md,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          fontWeight: tokens.typography.fontWeight.semibold
        }}>
          Quick Searches
        </div>
        <div style={{ display: 'flex', gap: tokens.spacing.md, flexWrap: 'wrap' }}>
          {searchTemplates.map((template, i) => (
            <button
              key={i}
              onClick={() => handleTemplateSearch(template.query)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.spacing.sm,
                padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
                background: tokens.colors.backgroundSecondary,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: tokens.radii.full,
                color: tokens.colors.text,
                fontSize: tokens.typography.fontSize.sm,
                cursor: 'pointer',
                transition: `all ${tokens.transitions.fast}`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.primary;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.border;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {template.icon}
              {template.label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Search Bar */}
      <div style={{
        background: tokens.colors.backgroundSecondary,
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radii.lg,
        padding: tokens.spacing.lg,
        marginBottom: tokens.spacing['2xl']
      }}>
        {/* Search Type Selector */}
        <div style={{ display: 'flex', gap: tokens.spacing.sm, marginBottom: tokens.spacing.md }}>
          {[
            { value: 'smart', label: 'Smart Search', desc: 'AI-powered semantic search', icon: <Brain size={16} /> },
            { value: 'exact', label: 'Exact Match', desc: 'Find exact phrases', icon: <Type size={16} /> },
            { value: 'recent', label: 'Recent Calls', desc: 'Browse latest calls', icon: <ClockIcon size={16} /> }
          ].map(type => (
            <button
              key={type.value}
              onClick={() => setSearchType(type.value)}
              style={{
                flex: 1,
                padding: tokens.spacing.md,
                background: searchType === type.value ? tokens.colors.backgroundTertiary : 'transparent',
                border: `1px solid ${searchType === type.value ? tokens.colors.primary : tokens.colors.border}`,
                borderRadius: tokens.radii.md,
                cursor: 'pointer',
                transition: `all ${tokens.transitions.fast}`
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.spacing.sm,
                fontSize: tokens.typography.fontSize.sm,
                fontWeight: tokens.typography.fontWeight.medium,
                marginBottom: tokens.spacing.xs
              }}>
                {type.icon}
                {type.label}
              </div>
              <div style={{
                fontSize: tokens.typography.fontSize.xs,
                color: tokens.colors.textTertiary
              }}>
                {type.desc}
              </div>
            </button>
          ))}
        </div>

        {/* Main Search Input */}
        <div style={{ display: 'flex', gap: tokens.spacing.md, marginBottom: tokens.spacing.md }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search
              size={20}
              style={{
                position: 'absolute',
                left: tokens.spacing.md,
                top: '50%',
                transform: 'translateY(-50%)',
                color: tokens.colors.textTertiary
              }}
            />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSearch()}
              placeholder={searchType === 'recent' ? 'Press search to view recent calls...' : 'Enter your search query...'}
              disabled={searchType === 'recent'}
              style={{
                width: '100%',
                padding: `${tokens.spacing.md} ${tokens.spacing.md} ${tokens.spacing.md} 48px`,
                background: tokens.colors.backgroundTertiary,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: tokens.radii.md,
                color: tokens.colors.text,
                fontSize: tokens.typography.fontSize.md,
                outline: 'none',
                transition: `all ${tokens.transitions.fast}`,
                opacity: searchType === 'recent' ? 0.5 : 1
              }}
              onFocus={(e) => {
                if (searchType !== 'recent') {
                  e.target.style.borderColor = tokens.colors.primary;
                }
              }}
              onBlur={(e) => {
                e.target.style.borderColor = tokens.colors.border;
              }}
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: tokens.spacing.sm,
              padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
              background: showFilters ? tokens.colors.backgroundTertiary : 'transparent',
              border: `1px solid ${showFilters ? tokens.colors.secondary : tokens.colors.border}`,
              borderRadius: tokens.radii.md,
              color: tokens.colors.text,
              fontSize: tokens.typography.fontSize.sm,
              cursor: 'pointer',
              transition: `all ${tokens.transitions.fast}`
            }}
          >
            <Filter size={16} />
            Filters
            {(dateRange !== 'all' || duration !== 'all' || disposition !== 'all' || agent !== 'all') && (
              <Badge variant="info" size="sm">Active</Badge>
            )}
          </button>

          <button
            onClick={handleSearch}
            disabled={loading || (!q.trim() && searchType !== 'recent')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: tokens.spacing.sm,
              padding: `${tokens.spacing.md} ${tokens.spacing.xl}`,
              background: tokens.colors.primary,
              border: `1px solid ${tokens.colors.primary}`,
              borderRadius: tokens.radii.md,
              color: tokens.colors.background,
              fontSize: tokens.typography.fontSize.sm,
              fontWeight: tokens.typography.fontWeight.medium,
              cursor: loading || (!q.trim() && searchType !== 'recent') ? 'not-allowed' : 'pointer',
              opacity: loading || (!q.trim() && searchType !== 'recent') ? 0.5 : 1,
              transition: `all ${tokens.transitions.fast}`
            }}
          >
            {loading ? (
              <span>Searching...</span>
            ) : (
              <>
                <Search size={16} />
                Search
              </>
            )}
          </button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div style={{
            padding: tokens.spacing.md,
            background: tokens.colors.backgroundTertiary,
            borderRadius: tokens.radii.md,
            border: `1px solid ${tokens.colors.border}`
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: tokens.spacing.md
            }}>
              <SelectFilter
                label="Date Range"
                options={[
                  { value: 'all', label: 'All Time' },
                  { value: 'today', label: 'Today' },
                  { value: 'week', label: 'Last 7 Days' },
                  { value: 'month', label: 'Last 30 Days' },
                  { value: 'quarter', label: 'Last 3 Months' }
                ]}
                value={dateRange}
                onChange={setDateRange}
              />

              <SelectFilter
                label="Call Duration"
                options={[
                  { value: 'all', label: 'Any Duration' },
                  { value: 'short', label: 'Short (< 1 min)' },
                  { value: 'medium', label: 'Medium (1-5 min)' },
                  { value: 'long', label: 'Long (> 5 min)' }
                ]}
                value={duration}
                onChange={setDuration}
              />

              <SelectFilter
                label="Call Status"
                options={[
                  { value: 'all', label: 'All Statuses' },
                  ...filterStats.dispositions.map(d => ({ value: d, label: d }))
                ]}
                value={disposition}
                onChange={setDisposition}
              />

              <SelectFilter
                label="Agent"
                options={[
                  { value: 'all', label: 'All Agents' },
                  ...filterStats.agents.map(a => ({ value: a, label: a }))
                ]}
                value={agent}
                onChange={setAgent}
              />
            </div>

            {(dateRange !== 'all' || duration !== 'all' || disposition !== 'all' || agent !== 'all') && (
              <button
                onClick={() => {
                  setDateRange('all');
                  setDuration('all');
                  setDisposition('all');
                  setAgent('all');
                }}
                style={{
                  marginTop: tokens.spacing.md,
                  padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
                  background: 'transparent',
                  border: `1px solid ${tokens.colors.border}`,
                  borderRadius: tokens.radii.md,
                  color: tokens.colors.textSecondary,
                  fontSize: tokens.typography.fontSize.sm,
                  cursor: 'pointer'
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
        <div style={{
          background: tokens.colors.backgroundSecondary,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.radii.lg,
          overflow: 'hidden'
        }}>
          <div style={{
            padding: tokens.spacing.lg,
            borderBottom: `1px solid ${tokens.colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <h2 style={{
                fontSize: tokens.typography.fontSize.lg,
                fontWeight: tokens.typography.fontWeight.semibold,
                marginBottom: tokens.spacing.xs
              }}>
                {searchType === 'recent' ? 'Recent Calls' : 'Search Results'}
              </h2>
              <p style={{
                fontSize: tokens.typography.fontSize.sm,
                color: tokens.colors.textTertiary
              }}>
                {loading ? 'Searching...' : (
                  searchType === 'recent'
                    ? `Showing ${results.length} recent calls`
                    : `Found ${total} matching calls for "${q}"`
                )}
              </p>
            </div>
            {total > 0 && searchType !== 'recent' && (
              <Badge variant={searchType === 'smart' ? 'info' : 'neutral'}>
                {searchType === 'smart' ? 'AI Relevance' : 'Exact Match'}
              </Badge>
            )}
          </div>

          {loading ? (
            <div style={{
              padding: tokens.spacing['3xl'],
              textAlign: 'center',
              color: tokens.colors.textTertiary
            }}>
              Analyzing {searchType === 'smart' ? 'semantically' : 'precisely'} across all transcripts...
            </div>
          ) : results.length > 0 ? (
            <>
              <div style={{ padding: `0 ${tokens.spacing.lg}` }}>
                {results.map((r: any, index: number) => (
                  <div
                    key={r.id}
                    style={{
                      padding: `${tokens.spacing.lg} 0`,
                      borderBottom: index < results.length - 1 ? `1px solid ${tokens.colors.border}` : 'none',
                      cursor: 'pointer',
                      transition: `all ${tokens.transitions.fast}`
                    }}
                    onClick={() => window.location.href = `/call/${r.id}`}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.paddingLeft = tokens.spacing.sm;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.paddingLeft = '0';
                    }}
                  >
                    <div style={{ display: 'flex', gap: tokens.spacing.lg }}>
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
                            background: tokens.colors.backgroundTertiary,
                            border: `2px solid ${tokens.colors.primary}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: tokens.typography.fontSize.lg,
                            fontWeight: tokens.typography.fontWeight.semibold,
                            color: tokens.colors.primary
                          }}>
                            {(r.score * 100).toFixed(0)}%
                          </div>
                          <div style={{
                            fontSize: tokens.typography.fontSize.xs,
                            color: tokens.colors.textTertiary,
                            marginTop: tokens.spacing.xs
                          }}>
                            Match Score
                          </div>
                        </div>
                      )}

                      {/* Main Content */}
                      <div style={{ flex: 1 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: tokens.spacing.md,
                          marginBottom: tokens.spacing.md
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{
                              fontSize: tokens.typography.fontSize.sm,
                              fontWeight: tokens.typography.fontWeight.semibold
                            }}>
                              {new Date(r.started_at).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                            <span style={{
                              fontSize: tokens.typography.fontSize.xs,
                              color: tokens.colors.textTertiary
                            }}>
                              {new Date(r.started_at).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>

                          {r.agent && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: tokens.spacing.xs,
                              padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
                              background: tokens.colors.backgroundTertiary,
                              borderRadius: tokens.radii.md,
                              fontSize: tokens.typography.fontSize.xs
                            }}>
                              <User size={12} />
                              {r.agent}
                            </div>
                          )}

                          {r.disposition && (
                            <Badge
                              variant={
                                r.disposition === 'Completed' ? 'success' :
                                r.disposition === 'No Answer' || r.disposition === 'Busy' ? 'warning' :
                                r.disposition === 'Failed' ? 'danger' : 'info'
                              }
                              size="sm"
                            >
                              {r.disposition}
                            </Badge>
                          )}

                          {r.duration_sec && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: tokens.spacing.xs,
                              fontSize: tokens.typography.fontSize.xs,
                              color: tokens.colors.textSecondary
                            }}>
                              <ClockIcon size={12} />
                              {formatDuration(r.duration_sec)}
                            </div>
                          )}
                        </div>

                        {(r.reason_primary || r.reason_secondary) && (
                          <div style={{
                            marginBottom: tokens.spacing.md,
                            display: 'flex',
                            gap: tokens.spacing.sm,
                            flexWrap: 'wrap'
                          }}>
                            {r.reason_primary && (
                              <span style={{
                                padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
                                background: tokens.colors.backgroundTertiary,
                                border: `1px solid ${tokens.colors.border}`,
                                borderRadius: tokens.radii.md,
                                fontSize: tokens.typography.fontSize.sm,
                                color: tokens.colors.textSecondary
                              }}>
                                {r.reason_primary}
                              </span>
                            )}
                            {r.reason_secondary && (
                              <span style={{
                                padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
                                background: tokens.colors.backgroundTertiary,
                                border: `1px solid ${tokens.colors.border}`,
                                borderRadius: tokens.radii.md,
                                fontSize: tokens.typography.fontSize.sm,
                                color: tokens.colors.textTertiary
                              }}>
                                {r.reason_secondary}
                              </span>
                            )}
                          </div>
                        )}

                        {r.summary && (
                          <div style={{
                            padding: tokens.spacing.md,
                            background: tokens.colors.backgroundTertiary,
                            borderLeft: `2px solid ${tokens.colors.primary}`,
                            borderRadius: `0 ${tokens.radii.md} ${tokens.radii.md} 0`,
                            marginBottom: tokens.spacing.md
                          }}>
                            <p style={{
                              fontSize: tokens.typography.fontSize.sm,
                              color: tokens.colors.textSecondary,
                              lineHeight: 1.6,
                              margin: 0
                            }}>
                              {r.summary}
                            </p>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: tokens.spacing.sm }}>
                          <button
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: tokens.spacing.xs,
                              padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
                              background: 'transparent',
                              border: `1px solid ${tokens.colors.border}`,
                              borderRadius: tokens.radii.md,
                              color: tokens.colors.text,
                              fontSize: tokens.typography.fontSize.sm,
                              cursor: 'pointer'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = `/call/${r.id}`;
                            }}
                          >
                            <Eye size={14} />
                            View Details
                          </button>
                          {r.recording_url && (
                            <button
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: tokens.spacing.xs,
                                padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
                                background: 'transparent',
                                border: `1px solid ${tokens.colors.border}`,
                                borderRadius: tokens.radii.md,
                                color: tokens.colors.text,
                                fontSize: tokens.typography.fontSize.sm,
                                cursor: 'pointer'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(r.recording_url, '_blank');
                              }}
                            >
                              <Play size={14} />
                              Play Recording
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                padding: tokens.spacing.lg,
                borderTop: `1px solid ${tokens.colors.border}`
              }}>
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
            <EmptyState
              icon={<Search size={48} />}
              title="No results found"
              subtitle={searchType === 'recent'
                ? 'No recent calls available'
                : `No calls matching "${q}" with current filters`}
            />
          ) : null}
        </div>
      )}

      {/* Live Status Indicator */}
      {searched && total > 0 && (
        <div style={{
          position: 'fixed',
          bottom: tokens.spacing.lg,
          right: tokens.spacing.lg,
          padding: `${tokens.spacing.sm} ${tokens.spacing.lg}`,
          background: tokens.colors.backgroundSecondary,
          backdropFilter: 'blur(10px)',
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.radii.full,
          display: 'flex',
          alignItems: 'center',
          gap: tokens.spacing.sm,
          fontSize: tokens.typography.fontSize.sm,
          color: tokens.colors.textSecondary,
          boxShadow: tokens.shadows.lg
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: tokens.colors.info,
            animation: 'pulse 2s infinite'
          }} />
          <span>Search Results</span>
          <span style={{ color: tokens.colors.info, fontWeight: tokens.typography.fontWeight.semibold }}>
            {total} Matches
          </span>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}