'use client';

import { useState } from 'react';

export default function TestSmartRecordingsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [leadId, setLeadId] = useState('');
  const [limit, setLimit] = useState(10);
  const [dryRun, setDryRun] = useState(true);

  const testSmartMatching = async () => {
    if (!leadId) {
      alert('Please enter a Lead ID');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/test/smart-recording-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          limit: limit,
          dry_run: dryRun,
          test_matching: true
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
      const response = await fetch('/api/test/smart-recording-test');
      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence === 1.0) return 'text-green-600 font-bold';
    if (confidence >= 0.95) return 'text-green-500';
    if (confidence >= 0.8) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence === 1.0) return '✅ EXACT MATCH';
    if (confidence >= 0.95) return '✅ FUZZY MATCH';
    if (confidence >= 0.8) return '⚠️ PROBABLE';
    return '❌ NO MATCH';
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', marginBottom: '30px' }}>
        🎯 Smart Recording Matching Test
      </h1>

      <div style={{
        background: '#f0f0f0',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '30px',
        color: '#000'
      }}>
        <h2 style={{ fontSize: '20px', marginBottom: '20px' }}>Test Smart Matching Algorithm</h2>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Lead ID (required):
          </label>
          <input
            type="text"
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            placeholder="Enter Convoso Lead ID"
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
            Limit (max 10):
          </label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Math.min(10, parseInt(e.target.value) || 10))}
            min="1"
            max="10"
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
            Dry Run (test without saving)
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={testSmartMatching}
            disabled={loading || !leadId}
            style={{
              padding: '10px 20px',
              background: loading || !leadId ? '#ccc' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading || !leadId ? 'not-allowed' : 'pointer',
              fontSize: '16px'
            }}
          >
            {loading ? 'Testing...' : 'Test Smart Matching'}
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
            Check System Status
          </button>
        </div>
      </div>

      {result && (
        <div style={{
          background: result.ok ? '#d4f4dd' : '#f4d4d4',
          padding: '20px',
          borderRadius: '8px',
          color: '#000'
        }}>
          <h3 style={{ fontSize: '18px', marginBottom: '15px' }}>
            {result.ok ? '✅ Results' : '❌ Error'}
          </h3>

          {result.message && (
            <p style={{ marginBottom: '10px' }}>{result.message}</p>
          )}

          {result.statistics && (
            <div style={{
              background: '#fff',
              padding: '15px',
              borderRadius: '6px',
              marginBottom: '15px'
            }}>
              <h4 style={{ fontSize: '16px', marginBottom: '10px' }}>
                📊 Matching Statistics
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>✅ Exact matches: {result.statistics.exact_matches}</div>
                <div>✅ Fuzzy matches: {result.statistics.fuzzy_matches}</div>
                <div>⚠️ Probable matches: {result.statistics.probable_matches}</div>
                <div>❌ Unmatched: {result.statistics.unmatched}</div>
              </div>
              <div style={{
                marginTop: '10px',
                fontSize: '18px',
                fontWeight: 'bold',
                color: result.statistics.success_rate.startsWith('9') ? '#4CAF50' : '#FF9800'
              }}>
                Success Rate: {result.statistics.success_rate}
              </div>
            </div>
          )}

          {result.match_results && result.match_results.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <h4 style={{ fontSize: '16px', marginBottom: '10px' }}>
                🎯 Match Results ({result.match_results.length} recordings)
              </h4>
              <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                {result.match_results.map((match: any, i: number) => (
                  <div key={i} style={{
                    background: '#fff',
                    padding: '10px',
                    marginBottom: '5px',
                    borderRadius: '4px',
                    borderLeft: `4px solid ${match.matched ? '#4CAF50' : '#f44336'}`
                  }}>
                    <div style={{ fontWeight: 'bold' }}>
                      Recording {match.recording_id}
                    </div>
                    {match.matched ? (
                      <div>
                        <div className={getConfidenceColor(match.match_details.confidence)}>
                          {getConfidenceLabel(match.match_details.confidence)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#666' }}>
                          Agent: {match.match_details.agent}
                        </div>
                        <div style={{ fontSize: '11px', color: '#666' }}>
                          {match.match_details.reason}
                        </div>
                        {!dryRun && (
                          <div style={{ fontSize: '11px', color: '#4CAF50' }}>
                            ✅ Database updated
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ color: '#f44336' }}>
                        ❌ {match.match_details.reason}
                        <div style={{ fontSize: '11px', color: '#666' }}>
                          Will go to manual review queue
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.status && (
            <div style={{
              background: '#fff',
              padding: '15px',
              borderRadius: '6px',
              marginBottom: '15px'
            }}>
              <h4 style={{ fontSize: '16px', marginBottom: '10px' }}>
                📈 System Status
              </h4>
              <div style={{ fontSize: '14px' }}>
                <div>Unmatched pending review: {result.status.unmatched_pending_review}</div>
                <div style={{ marginTop: '10px' }}>
                  Match confidence breakdown:
                  <ul style={{ paddingLeft: '20px', marginTop: '5px' }}>
                    <li>Exact: {result.status.match_statistics.exact}</li>
                    <li>Fuzzy: {result.status.match_statistics.fuzzy}</li>
                    <li>Probable: {result.status.match_statistics.probable}</li>
                    <li>Manual: {result.status.match_statistics.manual}</li>
                  </ul>
                </div>
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
        background: '#e3f2fd',
        borderRadius: '8px',
        color: '#0d47a1'
      }}>
        <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>
          🧠 Smart Matching Algorithm
        </h3>
        <div style={{ fontSize: '14px' }}>
          <p style={{ marginBottom: '10px' }}>
            This system uses a 3-layer confidence scoring algorithm:
          </p>
          <ul style={{ paddingLeft: '20px' }}>
            <li><strong>Exact Match (100%):</strong> Timestamps match within 1 second</li>
            <li><strong>Fuzzy Match (95%):</strong> Timestamps within 5 seconds</li>
            <li><strong>Probable Match (80%):</strong> Timestamps within 30 seconds</li>
            <li><strong>No Match:</strong> Goes to manual review queue</li>
          </ul>
          <p style={{ marginTop: '10px', fontWeight: 'bold' }}>
            Target: 98%+ automatic matching accuracy, 0% wrong agent attribution
          </p>
        </div>
      </div>
    </div>
  );
}