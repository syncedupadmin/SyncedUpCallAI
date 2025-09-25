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
                {result.analysis.summary}
              </p>
              {result.best_callback_window?.local_start && result.best_callback_window?.local_end && (
                <div className="text-sm text-gray-600 mt-4">
                  Callback window: {result.best_callback_window.local_start} → {result.best_callback_window.local_end}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Side */}
              <div className="space-y-8">
                {/* Scores Section */}
                {(result.qa_score != null || result.script_adherence != null) && (
                  <div>
                    <h3 className="font-semibold mb-4 text-lg">Scores</h3>

                    <div className="space-y-4">
                      {/* QA Score */}
                      {result.qa_score != null && (
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm">QA Score</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${result.qa_score || 0}%` }}></div>
                          </div>
                        </div>
                      )}

                      {/* Script Adherence */}
                      {result.script_adherence != null && (
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm">Script Adherence</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${result.script_adherence || 0}%` }}></div>
                          </div>
                        </div>
                      )}

                      {/* Call Stage Scores */}
                      {(result.greeting != null || result.discovery != null || result.benefits != null ||
                        result.objections != null || result.compliance != null || result.closing != null) && (
                        <div className="grid grid-cols-3 gap-4 mt-6">
                          {result.greeting != null && (
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Greeting</div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${result.greeting || 0}%` }}></div>
                              </div>
                            </div>
                          )}
                          {result.discovery != null && (
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Discovery</div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${result.discovery || 0}%` }}></div>
                              </div>
                            </div>
                          )}
                          {result.benefits != null && (
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Benefits</div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${result.benefits || 0}%` }}></div>
                              </div>
                            </div>
                          )}
                          {result.objections != null && (
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Objections</div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${result.objections || 0}%` }}></div>
                              </div>
                            </div>
                          )}
                          {result.compliance != null && (
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Compliance</div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${result.compliance || 0}%` }}></div>
                              </div>
                            </div>
                          )}
                          {result.closing != null && (
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Closing</div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${result.closing || 0}%` }}></div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Sentiment */}
                    {(result.sentiment_agent != null || result.sentiment_customer != null) && (
                      <div className="mt-6">
                        <h4 className="font-medium mb-2">Sentiment (agent/customer)</h4>
                        <div className="flex items-center gap-4">
                          {result.sentiment_agent != null && (
                            <span className="text-sm">agent {result.sentiment_agent}</span>
                          )}
                          {result.sentiment_customer != null && (
                            <span className="text-sm">customer {result.sentiment_customer}</span>
                          )}
                          {result.asr_quality && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">ASR {result.asr_quality}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Rebuttals Section */}
                {result.rebuttals?.used && result.rebuttals.used.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 text-lg">Rebuttals</h3>
                    <p className="text-sm text-gray-600 mb-3">Used ({result.rebuttals.used.length})</p>

                    <div className="space-y-3">
                      {result.rebuttals.used.map((rebuttal: any, idx: number) => (
                        <div key={idx} className="border-l-2 border-green-500 pl-3">
                          <p className="text-xs text-gray-500">
                            {rebuttal.timestamp} • <span className="text-green-600">{rebuttal.type}</span>
                          </p>
                          <p className="text-sm">"{rebuttal.quote}"</p>
                        </div>
                      ))}
                    </div>

                    {result.rebuttals.asked_for_card_after_last != null && (
                      <p className="text-sm text-gray-600 mt-3">
                        Asked for card after last rebuttal: {result.rebuttals.asked_for_card_after_last ? 'Yes' : 'No'}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Right Side */}
              <div className="space-y-8">
                {/* Outcome & Pricing */}
                {(result.analysis.outcome ||
                  result.analysis.monthly_premium != null ||
                  result.analysis.enrollment_fee != null ||
                  (result.analysis.red_flags && result.analysis.red_flags.length > 0)) && (
                  <div>
                    <h3 className="font-semibold mb-3 text-lg">Outcome & Pricing</h3>

                    <div className="space-y-2">
                      {result.analysis.outcome && (
                        <p className="text-sm">
                          <span className={`font-semibold ${
                            result.analysis.outcome === 'sale' ? 'text-green-600' :
                            result.analysis.outcome === 'callback' ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {result.analysis.outcome === 'sale' ? 'Payment scheduled' :
                             result.analysis.outcome === 'callback' ? 'Callback scheduled' : 'No sale'}
                          </span>
                        </p>
                      )}
                      {result.analysis.monthly_premium != null && (
                        <p className="text-sm">
                          ${result.analysis.monthly_premium}/mo
                        </p>
                      )}
                      {result.analysis.enrollment_fee != null && (
                        <p className="text-sm text-gray-600">
                          Enrollment: ${result.analysis.enrollment_fee}
                        </p>
                      )}

                      {result.analysis.red_flags && result.analysis.red_flags.length > 0 && (
                        result.analysis.red_flags.map((flag: string, idx: number) => (
                          <p key={idx} className="text-sm text-red-600">{flag}</p>
                        ))
                      )}

                      {result.evidence?.reason_primary_quote && (
                        <p className="text-xs text-gray-500 mt-2">
                          Evidence: "{result.evidence.reason_primary_quote}"
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Talk Metrics */}
                {result.talk_metrics && (
                  result.talk_metrics.agent_talk_time ||
                  result.talk_metrics.customer_talk_time ||
                  result.talk_metrics.silence_time ||
                  result.talk_metrics.interrupts != null
                ) && (
                  <div>
                    <h3 className="font-semibold mb-3 text-lg">Talk Metrics</h3>

                    <div className="space-y-1 text-sm">
                      {result.talk_metrics.agent_talk_time && (
                        <p>Agent: {result.talk_metrics.agent_talk_time}</p>
                      )}
                      {result.talk_metrics.customer_talk_time && (
                        <p>Customer: {result.talk_metrics.customer_talk_time}</p>
                      )}
                      {result.talk_metrics.silence_time && (
                        <p>Silence: {result.talk_metrics.silence_time}</p>
                      )}
                      {result.talk_metrics.interrupts != null && (
                        <p>Interrupts: {result.talk_metrics.interrupts}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions - only show if callback outcome */}
                {result.analysis.outcome === 'callback' && (
                  <div>
                    <h3 className="font-semibold mb-3 text-lg">Actions</h3>

                    <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition-colors">
                      schedule callback
                    </button>
                  </div>
                )}

                {/* CRM Updates - only show if there are updates */}
                {result.crm_updates && Object.keys(result.crm_updates).length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3 text-lg">CRM Updates</h3>

                    <div className="h-20 bg-gray-50 rounded border border-gray-200">
                      {/* CRM updates content would go here */}
                    </div>
                  </div>
                )}
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