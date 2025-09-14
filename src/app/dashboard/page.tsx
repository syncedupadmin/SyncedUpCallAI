'use client';

import { useEffect, useState } from 'react';
import CallsTable from './parts/CallsTable';
import Pagination from '@/src/components/Pagination';

export default function DashboardPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [jobProgress, setJobProgress] = useState<Record<string, number>>({});
  const [jobStatus, setJobStatus] = useState<Record<string, string>>({});
  const [metrics, setMetrics] = useState({
    totalCalls: 0,
    avgDuration: '0s',
    successRate: 0,
    activeAgents: 0,
    weekChange: 0,
    todayCalls: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const limit = 20;

  const fetchStats = () => {
    setStatsLoading(true);
    fetch('/api/ui/stats/safe')
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.metrics) {
          setMetrics(data.metrics);
        }
        setStatsLoading(false);
      })
      .catch(() => {
        setStatsLoading(false);
      });
  };

  const fetchCalls = (newOffset: number) => {
    setLoading(true);
    fetch(`/api/ui/calls?limit=${limit}&offset=${newOffset}`)
      .then(res => res.json())
      .then(data => {
        setRows(data.data || []);
        setTotal(data.total || 0);
        setOffset(newOffset);
        setLoading(false);
      })
      .catch(() => {
        setRows([]);
        setTotal(0);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCalls(0);
    fetchStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const handlePageChange = (newOffset: number) => {
    fetchCalls(newOffset);
  };

  // Monitor SSE for job progress
  const monitorCallProgress = (callId: string) => {
    const eventSource = new EventSource(`/api/ui/stream/${callId}`);
    
    eventSource.addEventListener('status', (event) => {
      const data = JSON.parse(event.data);
      let progress = 5; // Default queued
      
      switch (data.status) {
        case 'queued':
          progress = 5;
          break;
        case 'transcribing':
          progress = data.progress || 50; // 25-75%
          break;
        case 'embedding':
          progress = 85;
          break;
        case 'analyzing':
          progress = 95;
          break;
        case 'done':
          progress = 100;
          setTimeout(() => {
            eventSource.close();
            // Remove from tracking after completion
            const newProgress = { ...jobProgress };
            const newStatus = { ...jobStatus };
            delete newProgress[callId];
            delete newStatus[callId];
            setJobProgress(newProgress);
            setJobStatus(newStatus);
          }, 2000);
          break;
        case 'error':
          setJobStatus({ ...jobStatus, [callId]: 'error' });
          eventSource.close();
          break;
      }
      
      setJobProgress({ ...jobProgress, [callId]: progress });
      setJobStatus({ ...jobStatus, [callId]: data.status });
    });

    eventSource.addEventListener('error', () => {
      setJobStatus({ ...jobStatus, [callId]: 'error' });
      eventSource.close();
    });
  };

  const handleJobStart = (callId: string, jobType: 'transcribe' | 'analyze') => {
    setJobProgress({ ...jobProgress, [callId]: 5 });
    setJobStatus({ ...jobStatus, [callId]: 'queued' });
    monitorCallProgress(callId);
  };

  return (
    <div className="fade-in" style={{ padding: '40px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header Section */}
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
          Command Center
        </h1>
        <p style={{ color: '#6b6b7c', fontSize: 14 }}>
          Real-time call monitoring and intelligence platform
        </p>
      </div>

      {/* Metrics Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 24,
        marginBottom: 40
      }}>
        <div className="metric-card">
          <div className="metric-value">
            {statsLoading ? (
              <span className="pulse">...</span>
            ) : (
              metrics.totalCalls.toLocaleString()
            )}
          </div>
          <div className="metric-label">Total Calls</div>
          <div style={{ 
            marginTop: 12, 
            fontSize: 12, 
            color: metrics.weekChange >= 0 ? '#10b981' : '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
            {!statsLoading && metrics.weekChange !== 0 && (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {metrics.weekChange >= 0 ? (
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  ) : (
                    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                  )}
                </svg>
                {metrics.weekChange >= 0 ? '+' : ''}{metrics.weekChange}% from last week
              </>
            )}
            {!statsLoading && metrics.weekChange === 0 && (
              <span style={{ color: '#6b6b7c' }}>No change from last week</span>
            )}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-value">
            {statsLoading ? (
              <span className="pulse">...</span>
            ) : (
              metrics.avgDuration
            )}
          </div>
          <div className="metric-label">Average Duration</div>
          <div style={{ 
            marginTop: 12,
            display: 'flex',
            gap: 4,
            alignItems: 'center'
          }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{
                width: 24,
                height: 4 + (i * 3),
                background: i <= 3 ? '#00d4ff' : '#1a1a24',
                borderRadius: 2,
                transition: 'all 0.3s'
              }} />
            ))}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-value">
            {statsLoading ? (
              <span className="pulse">...</span>
            ) : (
              `${metrics.successRate}%`
            )}
          </div>
          <div className="metric-label">Success Rate</div>
          <div style={{ marginTop: 12 }}>
            <div style={{ 
              height: 4, 
              background: '#1a1a24', 
              borderRadius: 4,
              overflow: 'hidden'
            }}>
              <div style={{ 
                width: statsLoading ? '0%' : `${metrics.successRate}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #00d4ff, #7c3aed)',
                borderRadius: 4,
                boxShadow: '0 0 10px rgba(0, 212, 255, 0.5)',
                transition: 'width 0.5s ease'
              }} />
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="metric-value">
              {statsLoading ? (
                <span className="pulse">...</span>
              ) : (
                metrics.activeAgents
              )}
            </div>
            {metrics.activeAgents > 0 && (
              <div className="pulse" style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.5)'
              }} />
            )}
          </div>
          <div className="metric-label">Active Agents (24h)</div>
          <div style={{ 
            marginTop: 12,
            display: 'flex',
            gap: 4
          }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: i < Math.min(metrics.activeAgents, 8) ? '#10b981' : '#1a1a24',
                transition: 'background 0.3s'
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Calls Section */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ 
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h2 style={{ 
              fontSize: 18, 
              fontWeight: 600,
              marginBottom: 4
            }}>
              Recent Calls (≥10s)
            </h2>
            <p style={{ fontSize: 12, color: '#6b6b7c' }}>
              Monitor and analyze call activity in real-time
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ fontSize: 12 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filter
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export
            </button>
          </div>
        </div>
        
        {loading && offset === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="pulse" style={{ color: '#6b6b7c' }}>Loading call data...</div>
          </div>
        ) : (
          <>
            <CallsTable 
              rows={rows} 
              onJobStart={handleJobStart}
              jobProgress={jobProgress}
              jobStatus={jobStatus}
            />
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
        )}
      </div>

      {/* Activity Feed */}
      <div style={{ 
        position: 'fixed',
        bottom: 24,
        right: 24,
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
        <span>Live Activity</span>
        <span style={{ color: '#00d4ff', fontWeight: 600 }}>
          {rows.length > 0 ? `${rows.length} calls active` : 'Monitoring...'}
        </span>
      </div>
    </div>
  );
}