'use client';

import { useState } from 'react';

export default function TestSimple() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze-simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recording_url: url })
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error || 'Analysis failed');
      }
    } catch (error) {
      console.error(error);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  // Mock scores data for demonstration
  const mockScores = {
    qa_score: 70,
    script_adherence: 85,
    greeting: 75,
    discovery: 90,
    benefits: 85,
    objections: 60,
    compliance: 95,
    closing: 80
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Simple Analysis Tool</h1>

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Recording URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
                placeholder="https://admin-dt.convoso.com/..."
              />
            </div>
            <button
              onClick={analyze}
              disabled={loading || !url}
              className="px-8 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors border border-gray-600"
            >
              {loading ? 'Processing...' : 'Analyze'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-8 p-4 bg-red-900/20 border border-red-500 rounded-lg">
            <h2 className="text-xl font-semibold text-red-400 mb-2">Error</h2>
            <pre className="text-red-300 whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {result && (
          <div className="bg-white text-gray-900 rounded-lg p-8">
            {/* Header with Tags */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">Call Analysis</h2>
                <p className="text-gray-600 text-sm">Model {result.metadata?.model || 'N/A'} • v2.0 • Confidence 70%</p>
              </div>
              <div className="flex items-center gap-2">
                {result.analysis.outcome === 'callback' && (
                  <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded text-sm font-medium">post date</span>
                )}
                {result.analysis.outcome === 'sale' && (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">POST DATE</span>
                )}
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">intent: medium</span>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">lead score: 85</span>
              </div>
            </div>

            {/* Main Summary */}
            <div className="bg-blue-50 rounded-lg p-6 mb-6">
              <p className="text-lg">
                {result.analysis.summary || 'Customer expressed interest in a health insurance policy and agreed to a post date for payment.'}
              </p>
              <div className="text-sm text-gray-600 mt-4">
                Callback window: 10/1/2023, 9:00:00 AM → 10/1/2023, 8:00:00 PM
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Side */}
              <div className="space-y-8">
                {/* Scores Section */}
                <div>
                  <h3 className="font-semibold mb-4 text-lg">Scores</h3>

                  <div className="space-y-4">
                    {/* QA Score */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm">QA Score</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${mockScores.qa_score}%` }}></div>
                      </div>
                    </div>

                    {/* Script Adherence */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm">Script Adherence</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${mockScores.script_adherence}%` }}></div>
                      </div>
                    </div>

                    {/* Call Stage Scores */}
                    <div className="grid grid-cols-3 gap-4 mt-6">
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Greeting</div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${mockScores.greeting}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Discovery</div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${mockScores.discovery}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Benefits</div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${mockScores.benefits}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Objections</div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${mockScores.objections}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Compliance</div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${mockScores.compliance}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Closing</div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${mockScores.closing}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sentiment */}
                  <div className="mt-6">
                    <h4 className="font-medium mb-2">Sentiment (agent/customer)</h4>
                    <div className="flex items-center gap-4">
                      <span className="text-sm">agent 0.80</span>
                      <span className="text-sm">customer 0.70</span>
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">ASR good</span>
                    </div>
                  </div>
                </div>

                {/* Rebuttals Section */}
                <div>
                  <h3 className="font-semibold mb-3 text-lg">Rebuttals</h3>
                  <p className="text-sm text-gray-600 mb-3">Used (2)</p>

                  <div className="space-y-3">
                    <div className="border-l-2 border-green-500 pl-3">
                      <p className="text-xs text-gray-500">01:49 • <span className="text-green-600">pricing</span></p>
                      <p className="text-sm">"Yeah..."</p>
                    </div>
                    <div className="border-l-2 border-green-500 pl-3">
                      <p className="text-xs text-gray-500">02:18 • <span className="text-green-600">pricing</span></p>
                      <p className="text-sm">"Well, yeah, because they're they're they're idiots. They're not applying that you're on Medicaid rig..."</p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mt-3">Asked for card after last rebuttal: Yes</p>
                </div>
              </div>

              {/* Right Side */}
              <div className="space-y-8">
                {/* Outcome & Pricing */}
                <div>
                  <h3 className="font-semibold mb-3 text-lg">Outcome & Pricing</h3>

                  <div className="space-y-2">
                    <p className="text-sm">
                      <span className={`font-semibold ${
                        result.analysis.outcome === 'sale' ? 'text-green-600' :
                        result.analysis.outcome === 'callback' ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {result.analysis.outcome === 'sale' ? 'Payment scheduled' :
                         result.analysis.outcome === 'callback' ? 'Callback scheduled' : 'No sale'}
                      </span>
                    </p>
                    <p className="text-sm">
                      ${result.analysis.monthly_premium || '83.00'}/mo
                    </p>
                    {result.analysis.enrollment_fee && (
                      <p className="text-sm text-gray-600">
                        Enrollment: ${result.analysis.enrollment_fee}
                      </p>
                    )}

                    {result.analysis.red_flags && result.analysis.red_flags.length > 0 ? (
                      result.analysis.red_flags.map((flag: string, idx: number) => (
                        <p key={idx} className="text-sm text-red-600">{flag}</p>
                      ))
                    ) : (
                      <p className="text-sm text-gray-600">no risk flags</p>
                    )}

                    {result.analysis.reason && (
                      <p className="text-xs text-gray-500 mt-2">
                        Evidence: "{result.analysis.reason}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Talk Metrics */}
                <div>
                  <h3 className="font-semibold mb-3 text-lg">Talk Metrics</h3>

                  <div className="space-y-1 text-sm">
                    <p>Agent: 7m 4s</p>
                    <p>Customer: 2m 50s</p>
                    <p>Silence: 5m 20s</p>
                    <p>Interrupts: 0</p>
                  </div>
                </div>

                {/* Actions */}
                <div>
                  <h3 className="font-semibold mb-3 text-lg">Actions</h3>

                  <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition-colors">
                    schedule callback
                  </button>

                  <p className="text-xs text-gray-500 mt-2">
                    Wire these to: schedule callback, benefits email, trust email, payment retry, DNC, etc.
                  </p>
                </div>

                {/* CRM Updates */}
                <div>
                  <h3 className="font-semibold mb-3 text-lg">CRM Updates</h3>

                  <div className="h-20 bg-gray-50 rounded border border-gray-200"></div>
                </div>
              </div>
            </div>

            {/* Analysis Results Section */}
            <div className="mt-8 pt-8 border-t">
              <h3 className="text-xl font-bold mb-6">Analysis Results</h3>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="text-sm text-gray-600">Outcome</label>
                  <p className={`text-lg font-bold ${
                    result.analysis.outcome === 'sale' ? 'text-green-600' :
                    result.analysis.outcome === 'callback' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {result.analysis.outcome.toUpperCase()}
                  </p>
                </div>

                <div>
                  <label className="text-sm text-gray-600">Monthly Premium</label>
                  <p className="text-lg font-semibold">
                    ${result.analysis.monthly_premium || 'N/A'}
                  </p>
                </div>

                <div>
                  <label className="text-sm text-gray-600">Enrollment Fee</label>
                  <p className="text-lg font-semibold">
                    ${result.analysis.enrollment_fee || 'N/A'}
                  </p>
                </div>

                <div>
                  <label className="text-sm text-gray-600">Customer</label>
                  <p className="text-lg font-semibold">{result.analysis.customer_name || 'Unknown'}</p>
                </div>

                <div className="col-span-2">
                  <label className="text-sm text-gray-600">Policy Details</label>
                  <div className="flex gap-6 mt-1">
                    <span>Carrier: <strong>{result.analysis.policy_details?.carrier || 'N/A'}</strong></span>
                    <span>Plan Type: <strong>{result.analysis.policy_details?.plan_type || 'N/A'}</strong></span>
                    <span>Effective Date: <strong>{result.analysis.policy_details?.effective_date || 'N/A'}</strong></span>
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="text-sm text-gray-600">Reason</label>
                  <p className="text-base">{result.analysis.reason}</p>
                </div>

                <div>
                  <label className="text-sm text-gray-600">Red Flags</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {result.analysis.red_flags && result.analysis.red_flags.length > 0 ? (
                      result.analysis.red_flags.map((flag: string, idx: number) => (
                        <span key={idx} className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm">
                          {flag}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-500 text-sm">None</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <label className="text-sm text-gray-600">Summary</label>
                <p className="text-base">{result.analysis.summary}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}