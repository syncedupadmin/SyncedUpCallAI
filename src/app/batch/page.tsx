'use client';
import { useState, useEffect } from 'react';
import ProgressBar from '../../components/ProgressBar';

export default function BatchPage() {
  const [batchData, setBatchData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  // Trigger batch processing
  const startBatch = async () => {
    setLoading(true);
    setError(null);
    setBatchData(null);
    
    try {
      const res = await fetch('/api/ui/batch/trigger', {
        method: 'POST'
      });
      
      if (!res.ok) {
        throw new Error(`Failed to start batch: ${res.statusText}`);
      }
      
      const data = await res.json();
      setBatchId(data.batch_id);
      setBatchData(data);
      setPolling(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Poll for progress updates
  useEffect(() => {
    if (!polling || !batchId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ui/batch/progress?batch_id=${batchId}`);
        if (res.ok) {
          const data = await res.json();
          setBatchData(data);
          
          // Stop polling when complete
          if (data.progress && data.progress.completed + data.progress.failed >= data.progress.total) {
            setPolling(false);
          }
        }
      } catch (err) {
        console.error('Progress poll error:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [polling, batchId]);

  return (
    <div className="fade-in" style={{ padding: '40px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ 
        fontSize: 32, 
        fontWeight: 700,
        background: 'linear-gradient(135deg, #ffffff 0%, #a8a8b3 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        marginBottom: 32
      }}>
        Batch Processing
      </h1>

      <div className="glass-card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Transcription Batch Job
        </h3>
        
        <p style={{ fontSize: 14, color: '#6b6b7c', marginBottom: 24 }}>
          Process pending call transcriptions in batch. This job will find calls from the last 2 days 
          that have recordings but no transcripts, and process up to 10 calls at a time.
        </p>

        <button
          onClick={startBatch}
          disabled={loading || polling}
          className="btn btn-primary"
          style={{ marginBottom: 24 }}
        >
          {loading ? 'Starting...' : polling ? 'Processing...' : 'Start Batch Processing'}
        </button>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {batchData && batchData.progress && (
          <div>
            <ProgressBar
              value={batchData.progress.completed}
              max={batchData.progress.total}
              label="Transcriptions Completed"
              color="#10b981"
              height={12}
              animated={polling}
            />
            
            {batchData.progress.failed > 0 && (
              <div style={{ marginTop: 16 }}>
                <ProgressBar
                  value={batchData.progress.failed}
                  max={batchData.progress.total}
                  label="Failed"
                  color="#ef4444"
                  height={8}
                  animated={false}
                />
              </div>
            )}

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
              gap: 16,
              marginTop: 24 
            }}>
              <div className="stat-card">
                <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Total Calls</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{batchData.progress.total}</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Completed</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                  {batchData.progress.completed}
                </div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>In Progress</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#00d4ff' }}>
                  {batchData.progress.posted - batchData.progress.completed - batchData.progress.failed}
                </div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: 12, color: '#6b6b7c', marginBottom: 4 }}>Failed</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
                  {batchData.progress.failed}
                </div>
              </div>
            </div>

            {!polling && (
              <div style={{ 
                marginTop: 24, 
                padding: 16, 
                background: 'rgba(16, 185, 129, 0.1)', 
                borderRadius: 8,
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981', marginBottom: 4 }}>
                  Batch Complete
                </div>
                <div style={{ fontSize: 13, color: '#e5e5e5' }}>
                  Successfully processed {batchData.progress.completed} out of {batchData.progress.total} calls
                  {batchData.progress.failed > 0 && ` (${batchData.progress.failed} failed)`}
                </div>
              </div>
            )}
          </div>
        )}

        {batchData && !batchData.progress && (
          <div style={{ fontSize: 14, color: '#6b6b7c', marginTop: 16 }}>
            {batchData.scanned ? `Scanned ${batchData.scanned} calls, ${batchData.posted || 0} queued for processing` : 'No pending calls found'}
          </div>
        )}
      </div>

      <div className="glass-card">
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          Batch Processing Info
        </h3>
        
        <div style={{ fontSize: 14, lineHeight: 1.8, color: '#e5e5e5' }}>
          <p style={{ marginBottom: 12 }}>
            The batch processor automatically finds and transcribes eligible calls:
          </p>
          <ul style={{ marginLeft: 20, listStyle: 'disc' }}>
            <li>Calls from the last 48 hours</li>
            <li>Duration of at least 10 seconds</li>
            <li>Has a recording URL</li>
            <li>No existing transcript</li>
            <li>Processes up to 10 calls per batch</li>
          </ul>
          <p style={{ marginTop: 16, color: '#6b6b7c', fontSize: 13 }}>
            Note: The batch job runs automatically via cron every 30 minutes, or can be triggered manually using this page.
          </p>
        </div>
      </div>
    </div>
  );
}