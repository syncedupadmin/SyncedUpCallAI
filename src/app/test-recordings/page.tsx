'use client';

import { useState } from 'react';

export default function TestRecordingsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [limit, setLimit] = useState(10);
  const [dryRun, setDryRun] = useState(true);

  const fetchRecordings = async () => {
    if (!email) {
      alert('Please enter an agent email');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/test/fetch-convoso-recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: email,
          limit: limit,
          dry_run: dryRun
        })
      });

      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/test/fetch-convoso-recordings');
      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '30px' }}>
        🎙️ Convoso Recording Fetch Test
      </h1>

      <div style={{
        background: '#f0f0f0',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '30px',
        color: '#000'
      }}>
        <h2 style={{ fontSize: '20px', marginBottom: '20px' }}>Fetch Recordings</h2>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Agent Email (required):
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@example.com"
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Limit (max 100):
          </label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Math.min(100, parseInt(e.target.value) || 10))}
            min="1"
            max="100"
            style={{
              width: '100px',
              padding: '8px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              style={{ marginRight: '8px' }}
            />
            Dry Run (fetch but don't save to database)
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={fetchRecordings}
            disabled={loading || !email}
            style={{
              padding: '10px 20px',
              background: loading || !email ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading || !email ? 'not-allowed' : 'pointer',
              fontSize: '16px'
            }}
          >
            {loading ? 'Fetching...' : 'Fetch Recordings'}
          </button>

          <button
            onClick={checkStatus}
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: loading ? '#ccc' : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px'
            }}
          >
            Check Status
          </button>
        </div>
      </div>

      {result && (
        <div style={{
          background: result.ok ? '#d4f4dd' : '#f4d4d4',
          padding: '20px',
          borderRadius: '8px',
          marginTop: '20px',
          color: '#000'
        }}>
          <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>
            {result.ok ? '✅ Success' : '❌ Error'}
          </h3>

          {result.message && (
            <p style={{ marginBottom: '10px' }}>{result.message}</p>
          )}

          {result.results && (
            <div style={{ marginBottom: '15px' }}>
              <h4 style={{ fontSize: '16px', marginBottom: '8px' }}>Results:</h4>
              <ul style={{ paddingLeft: '20px' }}>
                <li>Fetched: {result.results.fetched} recordings</li>
                <li>Saved: {result.results.saved}</li>
                <li>Updated: {result.results.updated}</li>
                <li>Errors: {result.results.errors}</li>
              </ul>
            </div>
          )}

          {result.results?.recordings && result.results.recordings.length > 0 && (
            <div>
              <h4 style={{ fontSize: '16px', marginBottom: '8px' }}>
                Sample Recordings (first 5):
              </h4>
              <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                {result.results.recordings.slice(0, 5).map((rec: any, i: number) => (
                  <div key={i} style={{
                    background: '#fff',
                    padding: '8px',
                    marginBottom: '5px',
                    borderRadius: '4px'
                  }}>
                    <div>Lead ID: {rec.lead_id}</div>
                    <div>Agent: {rec.agent}</div>
                    <div>Recording: {rec.recording_url ? '✅ Has URL' : '❌ No URL'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <details style={{ marginTop: '15px' }}>
            <summary style={{ cursor: 'pointer' }}>Full Response (JSON)</summary>
            <pre style={{
              background: '#fff',
              padding: '10px',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '11px',
              marginTop: '10px'
            }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}

      <div style={{
        marginTop: '30px',
        padding: '20px',
        background: '#fff3cd',
        borderRadius: '8px',
        color: '#856404'
      }}>
        <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>⚠️ Important Notes:</h3>
        <ul style={{ paddingLeft: '20px', fontSize: '14px' }}>
          <li>Maximum 100 recordings per request (safety limit)</li>
          <li>Start with Dry Run enabled to test without saving</li>
          <li>Use a known agent email from Convoso</li>
          <li>Check Vercel logs for detailed debugging info</li>
        </ul>
      </div>
    </div>
  );
}