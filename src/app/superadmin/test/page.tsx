'use client';

import { useState } from 'react';

export default function SuperAdminTestPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const analyzeCall = async () => {
    if (!url) {
      setError('Please enter a recording URL');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/admin/test-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_url: url,
          meta: {
            agent_id: 'test',
            agent_name: 'Test Agent',
            campaign: 'test',
            duration_sec: 0,
            disposition: 'Unknown',
            direction: 'outbound'
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to analyze (${response.status})`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
      console.error('Analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (value: number | null) => {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-2">SuperAdmin Testing Interface</h1>
          <p className="text-gray-600 mb-4">
            Test the production analysis pipeline with any recording URL
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
                Recording URL
              </label>
              <input
                id="url"
                type="url"
                placeholder="https://admin-dt.convoso.com/play-recording-public/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            <button
              onClick={analyzeCall}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Analyzing...' : 'Analyze Recording'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-700">{error}</p>
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="space-y-6">
          {/* Analysis Summary */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Analysis Summary</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-sm text-gray-600">Outcome</label>
                  <div className="font-semibold capitalize">
                    {result.analysis?.outcome || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Monthly Premium</label>
                  <div className="font-semibold">
                    {formatMoney(result.analysis?.monthly_premium)}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Enrollment Fee</label>
                  <div className="font-semibold">
                    {formatMoney(result.analysis?.enrollment_fee)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-sm text-gray-600">Reason</label>
                  <p className="text-sm">{result.analysis?.reason || '—'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Summary</label>
                  <p className="text-sm">{result.analysis?.summary || '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Details */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Policy Details</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-gray-600">Carrier</label>
                  <div className="font-medium">
                    {result.analysis?.policy_details?.carrier || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Plan Type</label>
                  <div className="font-medium">
                    {result.analysis?.policy_details?.plan_type || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Effective Date</label>
                  <div className="font-medium">
                    {result.analysis?.policy_details?.effective_date || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Rebuttals Analysis */}
          {result.rebuttals && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">Objection Handling</h2>

                <div className="space-y-4">
                  {/* Addressed */}
                  <div>
                    <h3 className="font-medium mb-2">
                      Addressed Objections ({result.rebuttals.used?.length || 0})
                    </h3>
                    {result.rebuttals.used?.length > 0 ? (
                      <div className="space-y-2">
                        {result.rebuttals.used.map((item: any, i: number) => (
                          <div key={i} className="border rounded-lg p-3 bg-green-50">
                            <div className="text-sm font-medium text-gray-600 mb-1">
                              {item.ts} - {item.stall_type}
                            </div>
                            <div className="text-sm space-y-1">
                              <div><strong>Customer:</strong> {item.quote_customer}</div>
                              <div><strong>Agent:</strong> {item.quote_agent}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No addressed objections</p>
                    )}
                  </div>

                  {/* Missed */}
                  <div>
                    <h3 className="font-medium mb-2">
                      Missed Objections ({result.rebuttals.missed?.length || 0})
                    </h3>
                    {result.rebuttals.missed?.length > 0 ? (
                      <div className="space-y-2">
                        {result.rebuttals.missed.map((item: any, i: number) => (
                          <div key={i} className="border rounded-lg p-3 bg-red-50">
                            <div className="text-sm font-medium text-gray-600 mb-1">
                              {item.ts} - {item.stall_type}
                            </div>
                            <div className="text-sm">
                              <strong>Customer:</strong> {item.quote_customer}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No missed objections</p>
                    )}
                  </div>

                  {/* Immediate */}
                  <div>
                    <h3 className="font-medium mb-2">
                      Immediate Responses ({result.rebuttals.immediate?.length || 0})
                    </h3>
                    {result.rebuttals.immediate?.length > 0 ? (
                      <div className="space-y-2">
                        {result.rebuttals.immediate.map((item: any, i: number) => (
                          <div key={i} className="border rounded-lg p-3 bg-blue-50">
                            <div className="text-sm font-medium text-gray-600 mb-1">
                              {item.ts} - {item.stall_type}
                            </div>
                            <div className="text-sm space-y-1">
                              <div><strong>Customer:</strong> {item.quote_customer}</div>
                              <div><strong>Agent (15s):</strong> {item.quote_agent_immediate || 'No immediate response'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No immediate responses tracked</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Red Flags */}
          {result.analysis?.red_flags?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">Red Flags</h2>
                <div className="flex flex-wrap gap-2">
                  {result.analysis.red_flags.map((flag: string, i: number) => (
                    <span key={i} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Raw Data */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-2">Raw Response</h2>
              <p className="text-gray-600 text-sm mb-4">Full API response for debugging</p>
              <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}