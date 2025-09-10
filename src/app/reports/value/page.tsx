'use client';
import { useState } from 'react';
import useSWR from 'swr';

export default function ValueReport() {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);
  
  const { data, mutate } = useSWR(
    `/api/reports/value?from=${from}&to=${to}`,
    u => fetch(u).then(r => r.json())
  );

  const handleDateChange = () => {
    mutate();
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
          Revenue-Weighted Cancel Report
        </h1>
        <p style={{ color: '#6b6b7c', fontSize: 14 }}>
          Track cancellation impact by dollar value and identify top risk areas
        </p>
      </div>

      {/* Date Controls */}
      <div className="glass-card" style={{ marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: '#a8a8b3' }}>From Date</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="input"
            style={{ width: 200 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: '#a8a8b3' }}>To Date</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="input"
            style={{ width: 200 }}
          />
        </div>
        <button onClick={handleDateChange} className="btn btn-primary">
          Update Report
        </button>
      </div>

      {/* KPI Tiles */}
      {data?.stats && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 24,
          marginBottom: 40
        }}>
          <div className="metric-card">
            <div className="metric-value">{Number(data.stats.total_calls).toLocaleString()}</div>
            <div className="metric-label">Total Calls</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-value">{Number(data.stats.total_cancels).toLocaleString()}</div>
            <div className="metric-label">Total Cancels</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-value">{data.stats.cancel_rate}%</div>
            <div className="metric-label">Cancel Rate</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-value">${Number(data.stats.weighted_cancel_value).toLocaleString()}</div>
            <div className="metric-label">Weighted Cancel Value</div>
          </div>
        </div>
      )}

      {/* Tables Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Top Agents */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ 
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              Top Agents by Cancel Value
            </h2>
            <p style={{ fontSize: 12, color: '#6b6b7c' }}>
              Agents with highest revenue impact from cancellations
            </p>
          </div>
          
          <table className="table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Calls</th>
                <th>Cancels</th>
                <th>Cancel Value</th>
              </tr>
            </thead>
            <tbody>
              {data?.topAgents?.map((agent: any) => (
                <tr key={agent.id}>
                  <td>{agent.name || 'Unknown'}</td>
                  <td>{agent.calls}</td>
                  <td>{agent.cancels}</td>
                  <td style={{ color: '#ef4444' }}>
                    ${Number(agent.cancel_value).toLocaleString()}
                  </td>
                </tr>
              ))}
              {!data?.topAgents?.length && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#6b6b7c' }}>
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Top Campaigns */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ 
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              Top Campaigns by Cancel Value
            </h2>
            <p style={{ fontSize: 12, color: '#6b6b7c' }}>
              Campaigns with highest revenue impact from cancellations
            </p>
          </div>
          
          <table className="table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Calls</th>
                <th>Cancels</th>
                <th>Cancel Value</th>
              </tr>
            </thead>
            <tbody>
              {data?.topCampaigns?.map((campaign: any) => (
                <tr key={campaign.campaign}>
                  <td>{campaign.campaign}</td>
                  <td>{campaign.calls}</td>
                  <td>{campaign.cancels}</td>
                  <td style={{ color: '#ef4444' }}>
                    ${Number(campaign.cancel_value).toLocaleString()}
                  </td>
                </tr>
              ))}
              {!data?.topCampaigns?.length && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#6b6b7c' }}>
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}