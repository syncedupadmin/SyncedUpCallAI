'use client';

import { useState } from 'react';

export default function DiagnosePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [leadId, setLeadId] = useState('');
  const [email, setEmail] = useState('');

  const runDiagnostic = async () => {
    if (!leadId && !email) {
      alert('Please enter either a Lead ID or Email');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const body: any = {};
      if (leadId) body.lead_id = leadId;
      if (email) body.user_email = email;

      const response = await fetch('/api/test/convoso-diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', background: 'white', color: 'black', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '30px', color: 'black' }}>
        🔍 Convoso API Diagnostic Tool
      </h1>

      <div style={{
        background: '#f0f0f0',
        color: 'black',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '30px'
      }}>
        <h2 style={{ fontSize: '20px', marginBottom: '20px' }}>Test API Endpoints</h2>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Lead ID (to test lead endpoints):
          </label>
          <input
            type="text"
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            placeholder="Enter a Convoso Lead ID"
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
            User Email (to test user endpoints):
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

        <button
          onClick={runDiagnostic}
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
          {loading ? 'Testing endpoints...' : 'Run Diagnostic'}
        </button>
      </div>

      {result && (
        <div style={{
          background: result.ok ? '#d4f4dd' : '#f4d4d4',
          padding: '20px',
          borderRadius: '8px',
          color: '#000'
        }}>
          <h3 style={{ fontSize: '18px', marginBottom: '15px' }}>
            {result.ok ? '✅ Diagnostic Results' : '❌ Error'}
          </h3>

          {result.recommendation && (
            <div style={{
              padding: '15px',
              background: '#fff',
              borderRadius: '6px',
              marginBottom: '15px',
              fontWeight: 'bold'
            }}>
              📌 {result.recommendation}
            </div>
          )}

          {result.results?.WORKING_ENDPOINT && (
            <div style={{
              padding: '15px',
              background: '#4CAF50',
              color: 'white',
              borderRadius: '6px',
              marginBottom: '15px',
              fontSize: '16px'
            }}>
              ✅ FOUND WORKING ENDPOINT: {result.results.WORKING_ENDPOINT}
            </div>
          )}

          {result.results?.tests && (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '16px', marginBottom: '10px' }}>
                Test Results ({result.results.summary?.successful || 0} working / {result.results.tests.length} tested):
              </h4>
              <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                {result.results.tests.map((test: any, i: number) => (
                  <div key={i} style={{
                    padding: '10px',
                    marginBottom: '5px',
                    background: test.working ? '#c8f7c8' : test.success ? '#fff9c4' : '#ffcdd2',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontFamily: 'monospace'
                  }}>
                    <div style={{ fontWeight: 'bold' }}>
                      {test.method} {test.endpoint}
                    </div>
                    <div>
                      Status: {test.status} {test.statusText}
                      {test.working && ' ✅ WORKING'}
                    </div>
                    {test.error && (
                      <div style={{ color: '#d32f2f' }}>Error: {test.error}</div>
                    )}
                    {test.response_sample && (
                      <div style={{ marginTop: '5px', fontSize: '11px' }}>
                        Response: {JSON.stringify(test.response_sample)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <details>
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
        <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>📋 How to use:</h3>
        <ol style={{ paddingLeft: '20px', fontSize: '14px' }}>
          <li>Enter a Lead ID from Convoso to test lead-based endpoints</li>
          <li>Or enter an agent email to test user-based endpoints</li>
          <li>Click "Run Diagnostic" to test all endpoint variations</li>
          <li>The tool will show which endpoints work with your auth token</li>
          <li>Use the working endpoint in your integration</li>
        </ol>
      </div>
    </div>
  );
}