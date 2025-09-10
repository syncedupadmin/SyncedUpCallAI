'use client';

import { useEffect, useState } from 'react';
import CallsTable from './parts/CallsTable';
import Pagination from '@/src/components/Pagination';

export default function DashboardPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;
  
  // Mock metrics data
  const metrics = {
    totalCalls: 1247,
    avgDuration: '2m 34s',
    successRate: 87.3,
    activeAgents: 42
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
  }, []);

  const handlePageChange = (newOffset: number) => {
    fetchCalls(newOffset);
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
          <div className="metric-value">{metrics.totalCalls.toLocaleString()}</div>
          <div className="metric-label">Total Calls</div>
          <div style={{ 
            marginTop: 12, 
            fontSize: 12, 
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            </svg>
            +12.5% from last week
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-value">{metrics.avgDuration}</div>
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
          <div className="metric-value">{metrics.successRate}%</div>
          <div className="metric-label">Success Rate</div>
          <div style={{ marginTop: 12 }}>
            <div style={{ 
              height: 4, 
              background: '#1a1a24', 
              borderRadius: 4,
              overflow: 'hidden'
            }}>
              <div style={{ 
                width: `${metrics.successRate}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #00d4ff, #7c3aed)',
                borderRadius: 4,
                boxShadow: '0 0 10px rgba(0, 212, 255, 0.5)'
              }} />
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="metric-value">{metrics.activeAgents}</div>
            <div className="pulse" style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 20px rgba(16, 185, 129, 0.5)'
            }} />
          </div>
          <div className="metric-label">Active Agents</div>
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
                background: i < 5 ? '#10b981' : '#1a1a24'
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
              Recent Calls
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
            <CallsTable rows={rows} />
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