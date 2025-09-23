'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const ConvosoControlBoard = dynamic(() => import('./components/ConvosoControlBoard'), {
  ssr: false,
  loading: () => <div className="pulse">Loading control board...</div>
});

const ConvosoImporter = dynamic(() => import('./components/ConvosoImporter'), {
  ssr: false,
  loading: () => <div className="pulse">Loading importer...</div>
});

export default function AdminPage() {
  const [envStatus, setEnvStatus] = useState<any>(null);
  const [webhookCount, setWebhookCount] = useState<number | null>(null);
  const [healthData, setHealthData] = useState<any>(null);
  const [batchData, setBatchData] = useState<any>(null);
  const [lastCallId, setLastCallId] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

  useEffect(() => {
    // Check env variables (client-side mock - real check should be server-side)
    checkEnvironment();
    fetchWebhookCount();
    fetchLastCall();
  }, []);

  const checkEnvironment = async () => {
    // This is a mock - in production, create a secure endpoint that checks server-side
    const envVars = {
      OPENAI_API_KEY: process.env.NEXT_PUBLIC_OPENAI_KEY_SET === 'true',
      DEEPGRAM_API_KEY: process.env.NEXT_PUBLIC_DEEPGRAM_KEY_SET === 'true',
      ASSEMBLYAI_API_KEY: process.env.NEXT_PUBLIC_ASSEMBLYAI_KEY_SET === 'true',
      JOBS_SECRET: process.env.NEXT_PUBLIC_JOBS_SECRET_SET === 'true',
      DATABASE_URL: true, // Assume set if app is running
      APP_URL: true
    };
    
    // In production, call an API endpoint that checks these server-side
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setEnvStatus({
        OPENAI_API_KEY: data.ok,
        DEEPGRAM_API_KEY: data.ok,
        ASSEMBLYAI_API_KEY: data.ok,
        JOBS_SECRET: data.ok,
        DATABASE_URL: data.db?.ok || false,
        APP_URL: data.ok
      });
    } catch {
      setEnvStatus(envVars);
    }
  };

  const fetchWebhookCount = async () => {
    try {
      const res = await fetch('/api/admin/last-webhooks');
      const data = await res.json();
      setWebhookCount(data.count || 0);
    } catch {
      setWebhookCount(0);
    }
  };

  const fetchLastCall = async () => {
    try {
      const res = await fetch('/api/ui/calls?limit=1&offset=0');
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        setLastCallId(data.data[0].id);
      }
    } catch {
      setLastCallId(null);
    }
  };

  const runHealthCheck = async () => {
    setLoading({ ...loading, health: true });
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealthData(data);
    } catch (err: any) {
      setHealthData({ error: err.message });
    } finally {
      setLoading({ ...loading, health: false });
    }
  };

  const runBatchScan = async () => {
    setLoading({ ...loading, batch: true });
    try {
      // Try to get JOBS_SECRET from a secure source
      const secret = prompt('Enter JOBS_SECRET:');
      if (!secret) return;
      
      const res = await fetch(`/api/jobs/batch/scan?secret=${secret}`, {
        method: 'POST'
      });
      const data = await res.json();
      setBatchData(data);
      
      // Show success toast
      if (data.ok || data.posted > 0) {
        alert(`✅ Batch scan completed: ${data.posted || 0} jobs posted`);
      }
    } catch (err: any) {
      setBatchData({ error: err.message });
      alert(`❌ Batch scan failed: ${err.message}`);
    } finally {
      setLoading({ ...loading, batch: false });
    }
  };

  const analyzeUnanalyzed = async () => {
    setLoading({ ...loading, analyze: true });
    try {
      const secret = prompt('Enter JOBS_SECRET:');
      if (!secret) return;
      
      // First get unanalyzed calls
      const scanRes = await fetch(`/api/jobs/batch/scan?secret=${secret}`);
      const scanData = await scanRes.json();
      
      if (scanData.unanalyzed && scanData.unanalyzed.length > 0) {
        // Queue analysis for each unanalyzed call
        let queued = 0;
        for (const callId of scanData.unanalyzed.slice(0, 10)) { // Limit to 10
          try {
            await fetch(`/api/jobs/analyze?secret=${secret}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: callId })
            });
            queued++;
          } catch (e) {
            console.error(`Failed to queue analysis for ${callId}`, e);
          }
        }
        alert(`✅ Queued ${queued} calls for analysis`);
      } else {
        alert('ℹ️ No unanalyzed calls found');
      }
    } catch (err: any) {
      alert(`❌ Failed to analyze: ${err.message}`);
    } finally {
      setLoading({ ...loading, analyze: false });
    }
  };

  const replayQuarantined = async () => {
    setLoading({ ...loading, replay: true });
    try {
      const secret = prompt('Enter JOBS_SECRET:');
      if (!secret) return;

      const res = await fetch('/api/admin/replay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-jobs-secret': secret
        },
        body: JSON.stringify({ limit: 10 })
      });

      const data = await res.json();
      if (data.ok) {
        alert(`✅ Re-enqueued ${data.enqueued} quarantined events`);
      } else {
        alert(`❌ Failed to replay: ${data.error}`);
      }
    } catch (err: any) {
      alert(`❌ Failed to replay: ${err.message}`);
    } finally {
      setLoading({ ...loading, replay: false });
    }
  };

  const clearAllCalls = async () => {
    setLoading({ ...loading, clearCalls: true });
    try {
      const res = await fetch('/api/admin/clear-all-calls', {
        method: 'DELETE'
      });

      const data = await res.json();
      if (data.ok) {
        alert(`✅ ${data.message}`);
        // Refresh webhook count and last call
        fetchWebhookCount();
        fetchLastCall();
      } else {
        alert(`❌ Failed to clear calls: ${data.error}`);
      }
    } catch (err: any) {
      alert(`❌ Failed to clear calls: ${err.message}`);
    } finally {
      setLoading({ ...loading, clearCalls: false });
      setShowClearConfirmation(false);
    }
  };

  return (
    <div className="fade-in" style={{ padding: '40px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{
        fontSize: 32,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        marginBottom: 8
      }}>
        Operator Console
      </h1>
      <p style={{ color: '#6b6b7c', fontSize: 14, marginBottom: 32 }}>
        System operations and batch management
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 24 }}>
        {/* Environment Status */}
        <div className="glass-card">
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            Environment Readiness
          </h3>
          {envStatus ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(envStatus).map(([key, value]) => (
                <div key={key} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'rgba(20, 20, 30, 0.4)',
                  borderRadius: 6
                }}>
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#a8a8b3' }}>
                    {key}
                  </span>
                  <span style={{ fontSize: 16 }}>
                    {value ? '✅' : '❌'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="pulse" style={{ color: '#6b6b7c' }}>Checking environment...</div>
          )}
        </div>

        {/* Webhook Activity */}
        <div className="glass-card">
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            Recent Activity
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ 
              padding: 16, 
              background: 'rgba(0, 212, 255, 0.1)', 
              borderRadius: 8,
              border: '1px solid rgba(0, 212, 255, 0.2)'
            }}>
              <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>
                Recent Webhooks (25 min)
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#00d4ff' }}>
                {webhookCount !== null ? webhookCount : '—'}
              </div>
            </div>

            {lastCallId && (
              <a 
                href={`/api/ui/call/export?id=${lastCallId}&format=txt`}
                download
                className="btn btn-ghost"
                style={{ textAlign: 'center' }}
              >
                📥 Download Last Transcript
              </a>
            )}
          </div>
        </div>

        {/* Health Check */}
        <div className="glass-card">
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            System Health
          </h3>
          <button
            onClick={runHealthCheck}
            disabled={loading.health}
            className="btn btn-primary"
            style={{ marginBottom: 16, width: '100%' }}
          >
            {loading.health ? 'Running...' : '🏥 Run Health Check'}
          </button>
          
          {healthData && (
            <div style={{ 
              padding: 12, 
              background: '#0a0a0f', 
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              maxHeight: 300,
              overflowY: 'auto'
            }}>
              <pre style={{ 
                fontSize: 11, 
                fontFamily: 'monospace',
                color: healthData.ok ? '#10b981' : '#ef4444',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                {JSON.stringify(healthData, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Batch Scanner */}
        <div className="glass-card">
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            Batch Operations
          </h3>
          <button
            onClick={runBatchScan}
            disabled={loading.batch}
            className="btn btn-primary"
            style={{ marginBottom: 8, width: '100%' }}
          >
            {loading.batch ? 'Scanning...' : '🔍 Run Batch Scan'}
          </button>

          <button
            onClick={analyzeUnanalyzed}
            disabled={loading.analyze}
            className="btn btn-secondary"
            style={{ marginBottom: 8, width: '100%' }}
          >
            {loading.analyze ? 'Analyzing...' : '🧠 Analyze Unanalyzed'}
          </button>

          <button
            onClick={replayQuarantined}
            disabled={loading.replay}
            className="btn btn-warning"
            style={{ marginBottom: 8, width: '100%' }}
          >
            {loading.replay ? 'Replaying...' : '🔁 Replay Quarantined (10)'}
          </button>

          <button
            onClick={() => setShowClearConfirmation(true)}
            disabled={loading.clearCalls}
            className="btn"
            style={{
              marginBottom: 16,
              width: '100%',
              backgroundColor: '#dc2626',
              color: 'white',
              border: '1px solid #dc2626'
            }}
          >
            {loading.clearCalls ? 'Clearing...' : '🗑️ Clear All Calls'}
          </button>
          
          {batchData && (
            <div style={{ 
              padding: 16, 
              background: 'rgba(124, 58, 237, 0.1)', 
              borderRadius: 8,
              border: '1px solid rgba(124, 58, 237, 0.2)'
            }}>
              {batchData.error ? (
                <div style={{ color: '#ef4444' }}>Error: {batchData.error}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#6b6b7c' }}>Scanned</span>
                    <span style={{ fontWeight: 600 }}>{batchData.scanned || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#6b6b7c' }}>Posted</span>
                    <span style={{ fontWeight: 600 }}>{batchData.posted || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#6b6b7c' }}>Completed</span>
                    <span style={{ fontWeight: 600, color: '#10b981' }}>
                      {batchData.completed || 0}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Convoso Sync Panel - Full Width */}
      {/* Convoso Control Board */}
      <div style={{ marginTop: 32 }}>
        <ConvosoControlBoard />
      </div>

      {/* Convoso Import Dashboard */}
      <div style={{ marginTop: 32 }}>
        <ConvosoImporter />
      </div>

      {/* System Info */}
      <div className="glass-card" style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Quick Actions
        </h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/superadmin/audit-dashboard" className="btn btn-primary" style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
            color: 'white',
            fontWeight: 600,
            border: 'none'
          }}>
            🛡️ Portal Audit Dashboard
          </a>
          <a href="/ai-settings" className="btn btn-primary" style={{
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            color: 'white',
            fontWeight: 600,
            border: 'none'
          }}>
            🎯 AI Settings (Fix Over-tuning)
          </a>
          <a href="/testing/dashboard" className="btn btn-primary" style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            fontWeight: 600,
            border: 'none'
          }}>
            🧪 Testing Dashboard
          </a>
          <a href="/batch" className="btn btn-ghost">
            📊 Batch Monitor
          </a>
          <a href="/api/admin/last-webhooks" target="_blank" className="btn btn-ghost">
            🔗 View Webhooks API
          </a>
          <a href="/api/health" target="_blank" className="btn btn-ghost">
            💓 Health API
          </a>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-ghost"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Footer info */}
      <div style={{
        marginTop: 40,
        padding: 20,
        textAlign: 'center',
        color: '#6b6b7c',
        fontSize: 12
      }}>
        <div>Operator Console v0.9</div>
        <div style={{ marginTop: 8 }}>
          Environment: {process.env.NODE_ENV || 'production'} |
          Build: {new Date().toISOString().split('T')[0]}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showClearConfirmation && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#1a1a2e',
            border: '1px solid #dc2626',
            borderRadius: 12,
            padding: 32,
            maxWidth: 400,
            width: '90%'
          }}>
            <h2 style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#dc2626',
              marginBottom: 16
            }}>
              ⚠️ Warning: Clear All Calls
            </h2>
            <p style={{
              color: '#a8a8b3',
              marginBottom: 24,
              lineHeight: 1.6
            }}>
              This will permanently delete ALL calls, transcripts, analyses, and related data from the database.
              This action cannot be undone!
            </p>
            <p style={{
              color: '#ef4444',
              fontWeight: 600,
              marginBottom: 24
            }}>
              Are you absolutely sure you want to proceed?
            </p>
            <div style={{
              display: 'flex',
              gap: 12
            }}>
              <button
                onClick={() => setShowClearConfirmation(false)}
                className="btn btn-ghost"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={clearAllCalls}
                className="btn"
                style={{
                  flex: 1,
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: '1px solid #dc2626'
                }}
              >
                Yes, Clear All Calls
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}