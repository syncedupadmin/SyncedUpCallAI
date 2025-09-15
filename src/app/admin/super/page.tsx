'use client';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';

export default function SuperAdminPage() {
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [leadData, setLeadData] = useState<any[]>([]);
  const [callData, setCallData] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'webhooks' | 'leads' | 'calls' | 'test' | 'convoso'>('overview');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>({});
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [convosoStatus, setConvosoStatus] = useState<any>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    fetchData();
    fetchConvosoStatus();
    const interval = setInterval(() => {
      fetchData();
      fetchConvosoStatus();
    }, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchConvosoStatus = async () => {
    try {
      const res = await fetch('/api/integrations/convoso/status');
      const data = await res.json();
      setConvosoStatus(data);
    } catch (error) {
      console.error('Error fetching Convoso status:', error);
    }
  };

  const triggerManualSync = async (type: 'delta' | 'full') => {
    setSyncLoading(true);
    try {
      const endpoint = type === 'delta'
        ? '/api/cron/convoso-delta'
        : '/api/integrations/convoso/ingest';

      // Use the admin cookie for authentication since we're already in the admin portal
      const headers: any = {
        'Content-Type': 'application/json',
        'Cookie': document.cookie // Pass along admin-auth cookie
      };

      const res = await fetch(endpoint, {
        method: type === 'delta' ? 'GET' : 'POST',
        headers,
        ...(type === 'full' && {
          body: JSON.stringify({
            pages: 5,
            perPage: 100
          })
        })
      });

      const result = await res.json();
      alert(`Sync ${res.ok ? 'completed' : 'failed'}: ${JSON.stringify(result)}`);

      // Refresh status
      fetchConvosoStatus();
    } catch (error: any) {
      alert(`Sync failed: ${error.message}`);
    } finally {
      setSyncLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      // Fetch webhook logs
      const logsRes = await fetch('/api/admin/webhook-logs');
      const logs = await logsRes.json();
      setWebhookLogs(logs.data || []);

      // Fetch leads
      const leadsRes = await fetch('/api/admin/leads');
      const leads = await leadsRes.json();
      setLeadData(leads.data || []);

      // Fetch calls
      const callsRes = await fetch('/api/admin/calls');
      const calls = await callsRes.json();
      setCallData(calls.data || []);

      // Calculate stats
      const now = new Date();
      const today = new Date(now.setHours(0, 0, 0, 0));
      const todayLogs = logs.data?.filter((log: any) => new Date(log.created_at) >= today) || [];
      const todayLeads = leads.data?.filter((lead: any) => new Date(lead.created_at) >= today) || [];
      const todayCalls = calls.data?.filter((call: any) => new Date(call.started_at) >= today) || [];

      setStats({
        totalWebhooks: logs.data?.length || 0,
        todayWebhooks: todayLogs.length,
        totalLeads: leads.data?.length || 0,
        todayLeads: todayLeads.length,
        totalCalls: calls.data?.length || 0,
        todayCalls: todayCalls.length,
        lastWebhook: logs.data?.[0]?.created_at,
        lastLead: leads.data?.[0]?.created_at,
        lastCall: calls.data?.[0]?.started_at,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const testWebhook = async (type: 'lead' | 'call') => {
    setTestLoading(true);
    setTestResult(null);
    
    try {
      const endpoint = type === 'lead' 
        ? '/api/webhooks/convoso-leads/test'
        : '/api/webhooks/convoso/test';
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test: true,
          timestamp: new Date().toISOString(),
          type
        })
      });
      
      const result = await res.json();
      setTestResult({
        type,
        success: res.ok,
        status: res.status,
        response: result,
        timestamp: new Date().toISOString()
      });
      
      // Refresh data after test
      setTimeout(fetchData, 1000);
    } catch (error: any) {
      setTestResult({
        type,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      setTestLoading(false);
    }
  };

  const clearDatabase = async (table: string) => {
    if (!confirm(`Are you sure you want to clear all ${table} data? This cannot be undone.`)) {
      return;
    }
    
    try {
      const res = await fetch('/api/admin/clear-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table })
      });
      
      if (res.ok) {
        alert(`${table} data cleared successfully`);
        fetchData();
      } else {
        alert(`Failed to clear ${table} data`);
      }
    } catch (error) {
      alert(`Error clearing ${table} data`);
    }
  };

  return (
    <div className="fade-in" style={{ padding: '40px 32px', maxWidth: 1600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ 
          fontSize: 32, 
          fontWeight: 700,
          background: 'linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 8
        }}>
          Super Admin Portal
        </h1>
        <p style={{ color: '#6b6b7c', fontSize: 14 }}>
          Complete control over Convoso webhook integration and data management
        </p>
      </div>

      {/* Stats Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 20,
        marginBottom: 32
      }}>
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>TOTAL WEBHOOKS</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.totalWebhooks || 0}</div>
          <div style={{ fontSize: 11, color: '#00d4ff' }}>Today: {stats.todayWebhooks || 0}</div>
        </div>
        
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>TOTAL LEADS</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{stats.totalLeads || 0}</div>
          <div style={{ fontSize: 11, color: '#00d4ff' }}>Today: {stats.todayLeads || 0}</div>
        </div>
        
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>TOTAL CALLS</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#7c3aed' }}>{stats.totalCalls || 0}</div>
          <div style={{ fontSize: 11, color: '#00d4ff' }}>Today: {stats.todayCalls || 0}</div>
        </div>
        
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 8 }}>LAST ACTIVITY</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {stats.lastWebhook ? format(new Date(stats.lastWebhook), 'HH:mm:ss') : 'Never'}
          </div>
          <div style={{ fontSize: 11, color: '#6b6b7c' }}>
            {stats.lastWebhook ? format(new Date(stats.lastWebhook), 'MMM dd, yyyy') : 'No activity'}
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
          { key: 'overview', label: 'Overview', icon: '📊' },
          { key: 'webhooks', label: 'Webhook Logs', icon: '🔔' },
          { key: 'leads', label: 'Leads', icon: '👥' },
          { key: 'calls', label: 'Calls', icon: '📞' },
          { key: 'test', label: 'Test Tools', icon: '🧪' },
          { key: 'convoso', label: 'Convoso', icon: '🔄' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: '12px 20px',
              background: activeTab === tab.key ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #ff6b6b' : '2px solid transparent',
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
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden', minHeight: 400 }}>
        {activeTab === 'overview' && (
          <div style={{ padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>System Overview</h2>
            
            <div style={{ display: 'grid', gap: 24 }}>
              {/* Webhook Endpoints */}
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#00d4ff' }}>
                  Active Webhook Endpoints
                </h3>
                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: 16, borderRadius: 8 }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>LEAD WEBHOOK</div>
                    <code style={{ fontSize: 12, color: '#10b981' }}>
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/convoso-leads` : ''}
                    </code>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>CALL WEBHOOK</div>
                    <code style={{ fontSize: 12, color: '#7c3aed' }}>
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/convoso` : ''}
                    </code>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#00d4ff' }}>
                  Recent Activity
                </h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  {webhookLogs.slice(0, 5).map((log, i) => (
                    <div key={i} style={{ 
                      padding: 12, 
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <span style={{ 
                          padding: '2px 8px',
                          background: log.type === 'lead' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(124, 58, 237, 0.2)',
                          borderRadius: 4,
                          fontSize: 11,
                          color: log.type === 'lead' ? '#10b981' : '#7c3aed',
                          marginRight: 8
                        }}>
                          {log.type?.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 12, color: '#a8a8b3' }}>
                          {log.data?.name || log.data?.phone || 'Unknown'}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: '#6b6b7c' }}>
                        {format(new Date(log.created_at), 'HH:mm:ss')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Database Health */}
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#00d4ff' }}>
                  Database Health
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <div style={{ 
                    padding: 12, 
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: 6,
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: '#10b981' }}>
                      {callData.filter((c: any) => c.recording_url).length}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b6b7c' }}>With Recordings</div>
                  </div>
                  <div style={{ 
                    padding: 12, 
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: 6,
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: '#f59e0b' }}>
                      {callData.filter((c: any) => !c.recording_url).length}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b6b7c' }}>Pending Recording</div>
                  </div>
                  <div style={{ 
                    padding: 12, 
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: 6,
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: '#7c3aed' }}>
                      {leadData.filter((l: any) => l.converted).length}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b6b7c' }}>Converted Leads</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'webhooks' && (
          <div>
            <div style={{ 
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                Webhook Logs ({webhookLogs.length})
              </h3>
              <button
                onClick={() => clearDatabase('webhook_logs')}
                className="btn btn-danger"
                style={{ fontSize: 12 }}
              >
                Clear Logs
              </button>
            </div>
            <div style={{ maxHeight: 500, overflow: 'auto' }}>
              {webhookLogs.map((log, i) => (
                <div key={i} style={{ 
                  padding: '16px 24px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  console.log('Webhook data:', log.data);
                  alert(JSON.stringify(log.data, null, 2));
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <span style={{ 
                        padding: '2px 8px',
                        background: log.type === 'lead' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(124, 58, 237, 0.2)',
                        borderRadius: 4,
                        fontSize: 11,
                        color: log.type === 'lead' ? '#10b981' : '#7c3aed',
                        marginRight: 8
                      }}>
                        {log.type?.toUpperCase()}
                      </span>
                      <span style={{ 
                        padding: '2px 8px',
                        background: log.status === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        borderRadius: 4,
                        fontSize: 11,
                        color: log.status === 'success' ? '#10b981' : '#ef4444'
                      }}>
                        {log.status?.toUpperCase()}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#6b6b7c' }}>
                      {format(new Date(log.created_at), 'MMM dd, HH:mm:ss')}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#a8a8b3' }}>
                    {JSON.stringify(log.data).substring(0, 100)}...
                  </div>
                  {log.error && (
                    <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>
                      Error: {log.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'leads' && (
          <div>
            <div style={{ 
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                Leads ({leadData.length})
              </h3>
              <button
                onClick={() => clearDatabase('leads')}
                className="btn btn-danger"
                style={{ fontSize: 12 }}
              >
                Clear Leads
              </button>
            </div>
            <div style={{ maxHeight: 500, overflow: 'auto' }}>
              {leadData.map((lead: any, i: number) => (
                <div key={i} style={{ 
                  padding: '16px 24px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        {lead.first_name} {lead.last_name}
                      </span>
                      {lead.converted && (
                        <span style={{ 
                          marginLeft: 8,
                          padding: '2px 8px',
                          background: 'rgba(16, 185, 129, 0.2)',
                          borderRadius: 4,
                          fontSize: 11,
                          color: '#10b981'
                        }}>
                          CONVERTED
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: '#6b6b7c' }}>
                      {format(new Date(lead.created_at), 'MMM dd, HH:mm')}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#a8a8b3' }}>
                    📞 {lead.phone} • ✉️ {lead.email || 'No email'}
                  </div>
                  {lead.campaign && (
                    <div style={{ fontSize: 11, color: '#6b6b7c', marginTop: 4 }}>
                      Campaign: {lead.campaign}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'calls' && (
          <div>
            <div style={{ 
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                Calls ({callData.length})
              </h3>
              <button
                onClick={() => clearDatabase('calls')}
                className="btn btn-danger"
                style={{ fontSize: 12 }}
              >
                Clear Calls
              </button>
            </div>
            <div style={{ maxHeight: 500, overflow: 'auto' }}>
              {callData.map((call: any, i: number) => (
                <div key={i} style={{ 
                  padding: '16px 24px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer'
                }}
                onClick={() => window.location.href = `/call/${call.id}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        {call.campaign || 'Unknown Campaign'}
                      </span>
                      {call.recording_url && (
                        <span style={{ 
                          marginLeft: 8,
                          padding: '2px 8px',
                          background: 'rgba(16, 185, 129, 0.2)',
                          borderRadius: 4,
                          fontSize: 11,
                          color: '#10b981'
                        }}>
                          HAS RECORDING
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: '#6b6b7c' }}>
                      {format(new Date(call.started_at), 'MMM dd, HH:mm')}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#a8a8b3' }}>
                    Duration: {call.duration_sec}s • Disposition: {call.disposition || 'Unknown'}
                  </div>
                  {call.agent_name && (
                    <div style={{ fontSize: 11, color: '#6b6b7c', marginTop: 4 }}>
                      Agent: {call.agent_name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'test' && (
          <div style={{ padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Webhook Testing Tools</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
              {/* Test Lead Webhook */}
              <div style={{ 
                padding: 20,
                background: 'rgba(16, 185, 129, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: 8
              }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#10b981' }}>
                  Test Lead Webhook
                </h3>
                <p style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 16 }}>
                  Send a test lead webhook to verify the endpoint is working
                </p>
                <button
                  onClick={() => testWebhook('lead')}
                  disabled={testLoading}
                  className="btn btn-primary"
                  style={{ 
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    width: '100%'
                  }}
                >
                  {testLoading ? 'Testing...' : 'Send Test Lead'}
                </button>
              </div>

              {/* Test Call Webhook */}
              <div style={{ 
                padding: 20,
                background: 'rgba(124, 58, 237, 0.05)',
                border: '1px solid rgba(124, 58, 237, 0.2)',
                borderRadius: 8
              }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#7c3aed' }}>
                  Test Call Webhook
                </h3>
                <p style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 16 }}>
                  Send a test call webhook to verify the endpoint is working
                </p>
                <button
                  onClick={() => testWebhook('call')}
                  disabled={testLoading}
                  className="btn btn-primary"
                  style={{ 
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    width: '100%'
                  }}
                >
                  {testLoading ? 'Testing...' : 'Send Test Call'}
                </button>
              </div>
            </div>

            {/* Test Result */}
            {testResult && (
              <div style={{ 
                padding: 20,
                background: testResult.success ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                borderRadius: 8
              }}>
                <h4 style={{ 
                  fontSize: 14, 
                  fontWeight: 600, 
                  marginBottom: 12,
                  color: testResult.success ? '#10b981' : '#ef4444'
                }}>
                  Test Result: {testResult.success ? 'SUCCESS' : 'FAILED'}
                </h4>
                <div style={{ fontSize: 12, color: '#a8a8b3' }}>
                  <div>Type: {testResult.type}</div>
                  <div>Status: {testResult.status}</div>
                  <div>Time: {testResult.timestamp}</div>
                  <div style={{ marginTop: 8 }}>
                    Response: <pre style={{ 
                      background: 'rgba(0, 0, 0, 0.3)', 
                      padding: 8, 
                      borderRadius: 4,
                      fontSize: 11,
                      overflow: 'auto'
                    }}>
                      {JSON.stringify(testResult.response || testResult.error, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Test Instructions */}
            <div style={{ marginTop: 32 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                Manual Testing with cURL
              </h3>
              <div style={{ 
                background: 'rgba(0, 0, 0, 0.3)', 
                padding: 16, 
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 12
              }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: '#6b6b7c', marginBottom: 4 }}>Test Lead Webhook:</div>
                  <pre style={{ background: 'rgba(0, 0, 0, 0.5)', padding: 12, borderRadius: 4, overflow: 'auto' }}>
{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/convoso-leads \\
  -H "Content-Type: application/json" \\
  -d '{
    "first_name": "Test",
    "last_name": "User",
    "phone_number": "555-0123",
    "email": "test@example.com"
  }'`}
                  </pre>
                </div>
                
                <div>
                  <div style={{ color: '#6b6b7c', marginBottom: 4 }}>Test Call Webhook:</div>
                  <pre style={{ background: 'rgba(0, 0, 0, 0.5)', padding: 12, borderRadius: 4, overflow: 'auto' }}>
{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/convoso \\
  -H "Content-Type: application/json" \\
  -d '{
    "call_id": "test-123",
    "duration": 120,
    "disposition": "SALE",
    "agent_name": "Test Agent"
  }'`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'convoso' && (
          <div style={{ padding: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Convoso Integration</h2>

            {/* Status Overview */}
            {convosoStatus && (
              <div style={{
                padding: 20,
                background: 'rgba(0, 212, 255, 0.05)',
                border: '1px solid rgba(0, 212, 255, 0.2)',
                borderRadius: 8,
                marginBottom: 24
              }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#00d4ff' }}>
                  System Status
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  {/* Circuit Breaker Status */}
                  <div style={{
                    padding: 12,
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: 6
                  }}>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Circuit Breaker</div>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: convosoStatus.circuitBreaker?.state === 'closed' ? '#10b981' : '#ef4444'
                    }}>
                      {convosoStatus.circuitBreaker?.state?.toUpperCase() || 'UNKNOWN'}
                    </div>
                    {convosoStatus.circuitBreaker?.failures > 0 && (
                      <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>
                        Failures: {convosoStatus.circuitBreaker.failures}/5
                      </div>
                    )}
                  </div>

                  {/* Last Sync Time */}
                  <div style={{
                    padding: 12,
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: 6
                  }}>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Last Sync</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {convosoStatus.lastSync ? format(new Date(convosoStatus.lastSync), 'MMM dd, HH:mm:ss') : 'Never'}
                    </div>
                  </div>

                  {/* Total Synced */}
                  <div style={{
                    padding: 12,
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: 6
                  }}>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Total Synced</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {convosoStatus.totalSynced?.toLocaleString() || 0} calls
                    </div>
                  </div>

                  {/* Current Heartbeat */}
                  <div style={{
                    padding: 12,
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: 6
                  }}>
                    <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Heartbeat</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {convosoStatus.heartbeat ? format(new Date(convosoStatus.heartbeat), 'HH:mm:ss') : 'No heartbeat'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Sync Controls */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                Manual Sync Controls
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Delta Sync */}
                <div style={{
                  padding: 20,
                  background: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: 8
                }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#10b981' }}>
                    Delta Sync
                  </h4>
                  <p style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 16 }}>
                    Sync recent calls from the last 24-48 hours
                  </p>
                  <button
                    onClick={() => triggerManualSync('delta')}
                    disabled={syncLoading}
                    className="btn btn-primary"
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      width: '100%'
                    }}
                  >
                    {syncLoading ? 'Syncing...' : 'Run Delta Sync'}
                  </button>
                </div>

                {/* Full Sync */}
                <div style={{
                  padding: 20,
                  background: 'rgba(124, 58, 237, 0.05)',
                  border: '1px solid rgba(124, 58, 237, 0.2)',
                  borderRadius: 8
                }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#7c3aed' }}>
                    Full Sync
                  </h4>
                  <p style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 16 }}>
                    Full historical sync (5 pages, 100 calls per page)
                  </p>
                  <button
                    onClick={() => triggerManualSync('full')}
                    disabled={syncLoading}
                    className="btn btn-primary"
                    style={{
                      background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                      width: '100%'
                    }}
                  >
                    {syncLoading ? 'Syncing...' : 'Run Full Sync'}
                  </button>
                </div>
              </div>
            </div>

            {/* Sync History */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                Recent Sync History
              </h3>

              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 8,
                overflow: 'hidden'
              }}>
                {convosoStatus?.syncHistory && convosoStatus.syncHistory.length > 0 ? (
                  convosoStatus.syncHistory.map((sync: any, i: number) => (
                    <div key={i} style={{
                      padding: 16,
                      borderBottom: i < convosoStatus.syncHistory.length - 1 ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <span style={{
                          padding: '2px 8px',
                          background: sync.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          borderRadius: 4,
                          fontSize: 11,
                          color: sync.success ? '#10b981' : '#ef4444',
                          marginRight: 8
                        }}>
                          {sync.success ? 'SUCCESS' : 'FAILED'}
                        </span>
                        <span style={{ fontSize: 13, color: '#a8a8b3' }}>
                          {sync.type === 'delta' ? 'Delta Sync' : 'Full Sync'} - {sync.count || 0} calls
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: '#6b6b7c' }}>
                        {sync.timestamp ? format(new Date(sync.timestamp), 'MMM dd, HH:mm:ss') : 'Unknown'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: 32, textAlign: 'center', color: '#6b6b7c' }}>
                    No sync history available
                  </div>
                )}
              </div>
            </div>

            {/* Configuration Info */}
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                Configuration
              </h3>

              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                padding: 16,
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 12
              }}>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: '#6b6b7c' }}>API Endpoint: </span>
                  <span style={{ color: '#00d4ff' }}>https://portal.convoso.com/rest/v1</span>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: '#6b6b7c' }}>Cron Schedule: </span>
                  <span style={{ color: '#10b981' }}>Every 10 minutes</span>
                </div>
                <div>
                  <span style={{ color: '#6b6b7c' }}>Circuit Breaker: </span>
                  <span style={{ color: '#7c3aed' }}>5 failures trigger, 60s cooldown</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}