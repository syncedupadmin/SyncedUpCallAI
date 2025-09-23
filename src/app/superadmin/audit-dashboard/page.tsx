'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Activity,
  Database,
  Users,
  Settings,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
  TrendingUp,
  TrendingDown,
  Server,
  Lock,
  Zap,
  Clock,
  Info
} from 'lucide-react';

interface AuditResult {
  category: string;
  test: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
  timestamp: Date;
}

interface PortalAudit {
  overallStatus: 'healthy' | 'degraded' | 'critical';
  timestamp: Date;
  duration: number;
  results: AuditResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    healthScore: number;
  };
}

export default function AuditDashboard() {
  const [audit, setAudit] = useState<PortalAudit | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  const categoryIcons: Record<string, JSX.Element> = {
    'Authentication': <Lock className="w-5 h-5" />,
    'RBAC': <Shield className="w-5 h-5" />,
    'API Endpoints': <Server className="w-5 h-5" />,
    'Database': <Database className="w-5 h-5" />,
    'User Management': <Users className="w-5 h-5" />,
    'Settings': <Settings className="w-5 h-5" />,
    'Security': <Shield className="w-5 h-5" />,
    'Performance': <Zap className="w-5 h-5" />
  };

  const statusColors = {
    pass: 'text-green-500 bg-green-500/10',
    fail: 'text-red-500 bg-red-500/10',
    warning: 'text-yellow-500 bg-yellow-500/10'
  };

  const statusIcons = {
    pass: <CheckCircle className="w-4 h-4" />,
    fail: <XCircle className="w-4 h-4" />,
    warning: <AlertTriangle className="w-4 h-4" />
  };

  const runAudit = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/portal-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Audit failed: ${response.statusText}`);
      }

      const data = await response.json();
      setAudit(data);
    } catch (error: any) {
      console.error('Failed to run audit:', error);
      alert(`Failed to run audit: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLatestAudit = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/portal-audit');
      if (response.ok) {
        const data = await response.json();
        if (data && !data.message) {
          setAudit(data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch latest audit:', error);
    }
  }, []);

  useEffect(() => {
    fetchLatestAudit();
  }, [fetchLatestAudit]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        runAudit();
      }, 60000); // Auto-refresh every minute
      setRefreshInterval(interval);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      setRefreshInterval(null);
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [autoRefresh, runAudit]);

  const exportAuditReport = () => {
    if (!audit) return;

    const report = {
      ...audit,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portal-audit-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCategories = () => {
    if (!audit) return [];
    const categories = new Set(audit.results.map(r => r.category));
    return Array.from(categories);
  };

  const getFilteredResults = () => {
    if (!audit) return [];
    if (selectedCategory === 'all') return audit.results;
    return audit.results.filter(r => r.category === selectedCategory);
  };

  const getCategoryStats = (category: string) => {
    if (!audit) return { passed: 0, failed: 0, warnings: 0 };
    const categoryResults = audit.results.filter(r => r.category === category);
    return {
      passed: categoryResults.filter(r => r.status === 'pass').length,
      failed: categoryResults.filter(r => r.status === 'fail').length,
      warnings: categoryResults.filter(r => r.status === 'warning').length
    };
  };

  const getOverallStatusColor = () => {
    if (!audit) return '#6b7280';
    switch (audit.overallStatus) {
      case 'healthy': return '#10b981';
      case 'degraded': return '#f59e0b';
      case 'critical': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="fade-in" style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 32,
          fontWeight: 700,
          background: 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 8
        }}>
          Super Admin Portal Audit Dashboard
        </h1>
        <p style={{ color: '#6b6b7c', fontSize: 14 }}>
          Comprehensive system health monitoring and security audit
        </p>
      </div>

      {/* Control Panel */}
      <div className="glass-card" style={{ marginBottom: 24, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={runAudit}
              disabled={loading}
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                opacity: loading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Running Audit...
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4" />
                  Run Full Audit
                </>
              )}
            </button>

            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? 'btn btn-primary' : 'btn btn-ghost'}
              style={autoRefresh ? {
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              } : {
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Clock className="w-4 h-4" />
              {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
            </button>

            <button
              onClick={exportAuditReport}
              disabled={!audit}
              className="btn btn-ghost"
              style={{
                opacity: !audit ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>

          {audit && (
            <div style={{ fontSize: 13, color: '#6b6b7c' }}>
              Last audit: {new Date(audit.timestamp).toLocaleString()}
            </div>
          )}
        </div>

        {/* Overall Status */}
        {audit && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            <div className="glass-card" style={{ padding: 16, background: `${getOverallStatusColor()}20`, border: `1px solid ${getOverallStatusColor()}40` }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: getOverallStatusColor() }}>
                  {audit.overallStatus.toUpperCase()}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, color: '#a8a8b3' }}>System Status</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: 16, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: '#3b82f6' }}>{audit.summary.healthScore}%</div>
                <div style={{ fontSize: 12, opacity: 0.75, color: '#a8a8b3' }}>Health Score</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: 16, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: '#22c55e' }}>{audit.summary.passed}</div>
                <div style={{ fontSize: 12, opacity: 0.75, color: '#a8a8b3' }}>Passed</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: 16, background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: '#eab308' }}>{audit.summary.warnings}</div>
                <div style={{ fontSize: 12, opacity: 0.75, color: '#a8a8b3' }}>Warnings</div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: '#ef4444' }}>{audit.summary.failed}</div>
                <div style={{ fontSize: 12, opacity: 0.75, color: '#a8a8b3' }}>Failed</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Category Filter */}
      {audit && (
        <div className="glass-card" style={{ marginBottom: 24, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedCategory('all')}
              className={selectedCategory === 'all' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              style={selectedCategory === 'all' ? {
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)'
              } : {}}
            >
              All ({audit.results.length})
            </button>
            {getCategories().map(category => {
              const stats = getCategoryStats(category);
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={selectedCategory === category ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                  style={selectedCategory === category ? {
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  } : {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <span>{categoryIcons[category]}</span>
                  {category}
                  <span style={{ fontSize: 11, opacity: 0.8 }}>
                    ({stats.passed}/{stats.warnings}/{stats.failed})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Audit Results */}
      {audit && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
          {getFilteredResults().map((result, index) => (
            <div
              key={index}
              className="glass-card"
              style={{
                padding: 16,
                transition: 'all 0.3s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {categoryIcons[result.category]}
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{result.category}</span>
                </div>
                <div className={statusColors[result.status]} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px',
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase'
                }}>
                  {statusIcons[result.status]}
                  {result.status}
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 500, marginBottom: 4, fontSize: 14 }}>{result.test}</div>
                <div style={{ fontSize: 13, color: '#a8a8b3' }}>{result.message}</div>
              </div>

              {result.details && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: '#3b82f6' }}>
                    View Details
                  </summary>
                  <div style={{
                    marginTop: 8,
                    padding: 8,
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    overflowX: 'auto'
                  }}>
                    <pre style={{ margin: 0 }}>{JSON.stringify(result.details, null, 2)}</pre>
                  </div>
                </details>
              )}

              <div style={{ marginTop: 8, fontSize: 11, color: '#6b6b7c' }}>
                {new Date(result.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!audit && !loading && (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <Info className="w-12 h-12" style={{ margin: '0 auto 16px', color: '#6b6b7c' }} />
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Audit Data Available</h3>
          <p style={{ color: '#a8a8b3', marginBottom: 16 }}>
            Run a full system audit to see comprehensive health metrics
          </p>
          <button
            onClick={runAudit}
            className="btn btn-primary"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Activity className="w-4 h-4" />
            Run First Audit
          </button>
        </div>
      )}

      {/* Performance Metrics */}
      {audit && audit.duration && (
        <div className="glass-card" style={{ marginTop: 24, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap className="w-5 h-5" style={{ color: '#eab308' }} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Audit Performance</span>
            </div>
            <div style={{ fontSize: 13, color: '#a8a8b3' }}>
              Completed in {audit.duration}ms
            </div>
          </div>
        </div>
      )}
    </div>
  );
}