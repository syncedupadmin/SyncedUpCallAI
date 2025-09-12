'use client';

import { useEffect, useState } from 'react';

interface RollupRow {
  date: string;
  total_calls: number;
  analyzed_calls: number;
  success_calls: number;
  revenue_cents: number;
}

interface RollupData {
  ok: boolean;
  rows: RollupRow[];
  totals: {
    total_calls: number;
    analyzed_calls: number;
    success_calls: number;
    revenue_cents: number;
    success_rate: number;
  };
}

export default function ValueDashboard() {
  const [data, setData] = useState<RollupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/reports/rollups/simple?days=30')
      .then(res => res.json())
      .then((data: RollupData) => {
        if (data.ok) {
          setData(data);
        } else {
          setError('Failed to load data');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  if (loading) {
    return (
      <div className="fade-in" style={{ padding: '40px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <div className="animate-pulse">
          <div style={{ height: 32, background: 'rgba(255,255,255,0.1)', borderRadius: 8, width: '33%', marginBottom: 32 }}></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: 32 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="glass-card" style={{ height: 96 }}></div>
            ))}
          </div>
          <div className="glass-card" style={{ height: 384 }}></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fade-in" style={{ padding: '40px 32px', maxWidth: 1400, margin: '0 auto' }}>
        <div className="glass-card">
          <div style={{ color: '#ef4444' }}>Error: {error || 'No data available'}</div>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const maxCalls = Math.max(...data.rows.map(r => r.total_calls), 1);
  const maxRevenue = Math.max(...data.rows.map(r => r.revenue_cents), 100);
  const chartWidth = 800;
  const chartHeight = 300;
  const padding = 40;

  return (
    <div className="fade-in" style={{ padding: '40px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ 
        fontSize: 32, 
        fontWeight: 700,
        background: 'linear-gradient(135deg, #ffffff 0%, #a8a8b3 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        marginBottom: 32
      }}>
        Value & Volume Dashboard
      </h1>

      {/* KPI Tiles */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 24,
        marginBottom: 32
      }}>
        <div className="metric-card">
          <div className="metric-value">{formatNumber(data.totals.total_calls)}</div>
          <div className="metric-label">Total Calls</div>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>Last 30 days</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{formatNumber(data.totals.analyzed_calls)}</div>
          <div className="metric-label">Analyzed</div>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>
            {data.totals.total_calls > 0 
              ? `${Math.round((data.totals.analyzed_calls / data.totals.total_calls) * 100)}%`
              : '0%'} coverage
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{data.totals.success_rate}%</div>
          <div className="metric-label">Success Rate</div>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>
            {formatNumber(data.totals.success_calls)} successful
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{formatCurrency(data.totals.revenue_cents)}</div>
          <div className="metric-label">Revenue</div>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginTop: 4 }}>Total tracked</div>
        </div>
      </div>

      {/* Call Volume Chart */}
      <div className="glass-card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Call Volume (30 days)</h2>
        <div style={{ overflowX: 'auto' }}>
          <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ minWidth: '100%' }}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(i => (
              <line
                key={i}
                x1={padding}
                y1={padding + (chartHeight - 2 * padding) * (1 - i)}
                x2={chartWidth - padding}
                y2={padding + (chartHeight - 2 * padding) * (1 - i)}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="2,2"
              />
            ))}
            
            {/* Axes */}
            <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="rgba(255,255,255,0.2)" />
            <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="rgba(255,255,255,0.2)" />
            
            {/* Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map(i => (
              <text
                key={i}
                x={padding - 10}
                y={padding + (chartHeight - 2 * padding) * (1 - i) + 5}
                textAnchor="end"
                fill="#9ca3af"
                fontSize="12"
              >
                {Math.round(maxCalls * i)}
              </text>
            ))}
            
            {/* Data lines */}
            {['total', 'analyzed', 'success'].map((type, idx) => {
              const color = ['#3b82f6', '#10b981', '#8b5cf6'][idx];
              const values = data.rows.map(r => 
                type === 'total' ? r.total_calls :
                type === 'analyzed' ? r.analyzed_calls :
                r.success_calls
              ).reverse();
              
              const points = values.map((v, i) => {
                const x = padding + (i / (values.length - 1)) * (chartWidth - 2 * padding);
                const y = padding + (1 - v / maxCalls) * (chartHeight - 2 * padding);
                return `${x},${y}`;
              }).join(' ');
              
              return (
                <g key={type}>
                  <polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                  />
                  {values.map((v, i) => {
                    const x = padding + (i / (values.length - 1)) * (chartWidth - 2 * padding);
                    const y = padding + (1 - v / maxCalls) * (chartHeight - 2 * padding);
                    return (
                      <circle key={i} cx={x} cy={y} r="3" fill={color} />
                    );
                  })}
                </g>
              );
            })}
            
            {/* Legend */}
            <g transform={`translate(${chartWidth - 200}, 20)`}>
              <rect x="0" y="0" width="10" height="10" fill="#3b82f6" />
              <text x="15" y="9" fill="#9ca3af" fontSize="12">Total</text>
              <rect x="60" y="0" width="10" height="10" fill="#10b981" />
              <text x="75" y="9" fill="#9ca3af" fontSize="12">Analyzed</text>
              <rect x="130" y="0" width="10" height="10" fill="#8b5cf6" />
              <text x="145" y="9" fill="#9ca3af" fontSize="12">Success</text>
            </g>
          </svg>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="glass-card">
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Revenue Trend (30 days)</h2>
        <div style={{ overflowX: 'auto' }}>
          <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ minWidth: '100%' }}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(i => (
              <line
                key={i}
                x1={padding}
                y1={padding + (chartHeight - 2 * padding) * (1 - i)}
                x2={chartWidth - padding}
                y2={padding + (chartHeight - 2 * padding) * (1 - i)}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="2,2"
              />
            ))}
            
            {/* Axes */}
            <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="rgba(255,255,255,0.2)" />
            <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="rgba(255,255,255,0.2)" />
            
            {/* Y-axis labels */}
            {[0, 0.25, 0.5, 0.75, 1].map(i => (
              <text
                key={i}
                x={padding - 10}
                y={padding + (chartHeight - 2 * padding) * (1 - i) + 5}
                textAnchor="end"
                fill="#9ca3af"
                fontSize="12"
              >
                {formatCurrency(maxRevenue * i)}
              </text>
            ))}
            
            {/* Revenue bars */}
            {data.rows.slice().reverse().map((row, i) => {
              const barWidth = (chartWidth - 2 * padding) / data.rows.length * 0.8;
              const x = padding + (i / data.rows.length) * (chartWidth - 2 * padding) + barWidth * 0.1;
              const height = (row.revenue_cents / maxRevenue) * (chartHeight - 2 * padding);
              const y = chartHeight - padding - height;
              
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={height}
                  fill="#f59e0b"
                  opacity="0.8"
                />
              );
            })}
            
            {/* X-axis labels (dates) */}
            {data.rows.slice().reverse().filter((_, i) => i % 5 === 0).map((row, i, arr) => {
              const actualIndex = data.rows.slice().reverse().findIndex(r => r.date === row.date);
              const x = padding + (actualIndex / data.rows.length) * (chartWidth - 2 * padding) + 
                       ((chartWidth - 2 * padding) / data.rows.length * 0.5);
              return (
                <text
                  key={i}
                  x={x}
                  y={chartHeight - padding + 20}
                  textAnchor="middle"
                  fill="#9ca3af"
                  fontSize="10"
                >
                  {new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </text>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}