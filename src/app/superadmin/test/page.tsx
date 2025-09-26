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

  const formatTimestamp = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-6 max-w-full mx-auto bg-gray-50 min-h-screen">
      <div className="bg-white border border-gray-300 rounded-lg shadow-lg mb-6">
        <div className="p-6">
          <h1 className="text-3xl font-bold mb-2 text-gray-900">SuperAdmin Testing Interface</h1>
          <p className="text-base text-gray-700 mb-4">
            Test the production analysis pipeline with any recording URL
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="url" className="block text-base font-semibold text-gray-800 mb-1">
                Recording URL
              </label>
              <input
                id="url"
                type="url"
                placeholder="https://admin-dt.convoso.com/play-recording-public/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-base text-gray-900 bg-white placeholder-gray-400"
              />
            </div>
            <button
              onClick={analyzeCall}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white text-base font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Analyzing...' : 'Analyze Recording'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border-2 border-red-300 rounded-md">
              <p className="text-red-700 text-base font-medium">{error}</p>
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="space-y-6">
          {/* Core Analysis Results */}
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">
                Core Analysis Results
                <span className="ml-3 text-sm font-normal text-gray-600">(Pass B - ASR Corrected)</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="text-base font-semibold text-gray-700 block mb-1">Outcome</label>
                  <div className="text-xl font-bold text-blue-600 capitalize">
                    {result.analysis?.outcome || '—'}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="text-base font-semibold text-gray-700 block mb-1">
                    Monthly Premium
                    {result.analysis?.monthly_premium >= 100 && (
                      <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded">✓ Corrected</span>
                    )}
                  </label>
                  <div className="text-xl font-bold text-green-600">
                    {formatMoney(result.analysis?.monthly_premium)}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="text-base font-semibold text-gray-700 block mb-1">
                    Enrollment Fee
                    {result.analysis?.enrollment_fee >= 50 && (
                      <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded">✓ Corrected</span>
                    )}
                  </label>
                  <div className="text-xl font-bold text-green-600">
                    {formatMoney(result.analysis?.enrollment_fee)}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 pl-4">
                  <label className="text-base font-semibold text-gray-700 block mb-1">Reason</label>
                  <p className="text-base text-gray-800">{result.analysis?.reason || '—'}</p>
                </div>
                <div className="border-l-4 border-blue-500 pl-4">
                  <label className="text-base font-semibold text-gray-700 block mb-1">Summary</label>
                  <p className="text-base text-gray-800">{result.analysis?.summary || '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Customer & Agent Info */}
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">Customer & Agent Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Customer Name</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.analysis?.customer_name || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Agent Name</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.analysis?.agent_name || result.metadata?.agent_name || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Details */}
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">Policy Details</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Carrier</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.analysis?.policy_details?.carrier || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Plan Type</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.analysis?.policy_details?.plan_type || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Effective Date</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.analysis?.policy_details?.effective_date || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mentions Table */}
          {result.mentions_table && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Extracted Mentions</h2>

                {/* Money Mentions with ASR Correction Display */}
                {result.mentions_table.money_mentions?.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-bold mb-3 text-gray-800">Money Mentions</h3>
                    <div className="space-y-3">
                      {result.mentions_table.money_mentions.map((item: any, i: number) => {
                        // Determine if ASR correction was applied based on Pass B rules
                        const getCorrectedInfo = () => {
                          // Parse the raw value to check if correction is needed
                          const rawStr = item.value_raw?.replace(/[$,]/g, '').trim();

                          if (item.field_hint === 'monthly_premium' && result.analysis?.monthly_premium) {
                            // Check if raw value is under $50 and corrected to hundreds
                            if (rawStr && parseFloat(rawStr) < 50 && result.analysis.monthly_premium >= 100) {
                              return { value: `$${result.analysis.monthly_premium}`, needsCorrection: true };
                            }
                            return { value: `$${result.analysis.monthly_premium}`, needsCorrection: false };
                          }

                          if (item.field_hint === 'first_month_bill' && result.analysis?.monthly_premium) {
                            // First month bill = premium + enrollment
                            const enrollment = result.analysis?.enrollment_fee || 0;
                            const premium = result.analysis?.monthly_premium || 0;
                            const total = premium + enrollment;
                            // Check if raw value is under $50 and corrected to hundreds
                            if (rawStr && parseFloat(rawStr) < 50 && total >= 100) {
                              return { value: `$${total}`, needsCorrection: true };
                            }
                            return { value: `$${total}`, needsCorrection: false };
                          }

                          if (item.field_hint === 'enrollment_fee' && result.analysis?.enrollment_fee) {
                            // Enrollment fee correction: if raw < 10, multiply by 100
                            if (rawStr && parseFloat(rawStr) < 10 && result.analysis.enrollment_fee >= 50) {
                              return { value: `$${result.analysis.enrollment_fee}`, needsCorrection: true };
                            }
                            return { value: `$${result.analysis.enrollment_fee}`, needsCorrection: false };
                          }

                          return { value: null, needsCorrection: false };
                        };

                        const correctionInfo = getCorrectedInfo();
                        const { value: correctedValue, needsCorrection } = correctionInfo;

                        return (
                          <div key={i} className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="text-base font-semibold text-gray-700">
                                  {item.field_hint.replace(/_/g, ' ')}: {' '}
                                  {needsCorrection ? (
                                    <>
                                      <span className="line-through text-red-500">{item.value_raw}</span>
                                      <span className="ml-2 text-green-600 font-bold">
                                        → {correctedValue} ✓
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-gray-900 ml-1">{item.value_raw}</span>
                                  )}
                                </div>
                                <div className="text-base text-gray-700 italic mt-1">"{item.quote}"</div>
                                <div className="text-sm text-gray-600 mt-1">Speaker: {item.speaker}</div>
                              </div>
                              {needsCorrection && (
                                <div className="ml-3 px-2 py-1 bg-green-100 border border-green-300 rounded text-xs font-semibold text-green-700">
                                  ASR Corrected
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Carrier Mentions */}
                {result.mentions_table.carrier_mentions?.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-bold mb-3 text-gray-800">Carrier Mentions</h3>
                    <div className="space-y-3">
                      {result.mentions_table.carrier_mentions.map((item: any, i: number) => (
                        <div key={i} className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                          <div className="text-base font-semibold text-gray-700">{item.carrier}</div>
                          <div className="text-base text-gray-700 italic">"{item.quote}"</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Date Mentions */}
                {result.mentions_table.date_mentions?.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-bold mb-3 text-gray-800">Date Mentions</h3>
                    <div className="space-y-3">
                      {result.mentions_table.date_mentions.map((item: any, i: number) => (
                        <div key={i} className="bg-purple-50 border border-purple-300 rounded-lg p-4">
                          <div className="text-base font-semibold text-gray-700">
                            {item.kind}: {item.value_raw}
                          </div>
                          <div className="text-base text-gray-700 italic">"{item.quote}"</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Rebuttals Analysis */}
          {result.rebuttals && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Objection Handling Analysis</h2>

                <div className="space-y-6">
                  {/* Addressed */}
                  <div>
                    <h3 className="text-lg font-bold mb-3 text-green-700">
                      ✓ Addressed Objections ({result.rebuttals.used?.length || 0})
                    </h3>
                    {result.rebuttals.used?.length > 0 ? (
                      <div className="space-y-3">
                        {result.rebuttals.used.map((item: any, i: number) => (
                          <div key={i} className="border-2 border-green-300 rounded-lg p-4 bg-green-50">
                            <div className="text-base font-semibold text-gray-700 mb-2">
                              [{item.ts}] {item.stall_type}
                            </div>
                            <div className="space-y-2">
                              <div className="text-base text-gray-800">
                                <span className="font-semibold">Customer:</span> "{item.quote_customer}"
                              </div>
                              <div className="text-base text-gray-800">
                                <span className="font-semibold">Agent Response:</span> "{item.quote_agent}"
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-base text-gray-600">No addressed objections</p>
                    )}
                  </div>

                  {/* Missed */}
                  <div>
                    <h3 className="text-lg font-bold mb-3 text-red-700">
                      ✗ Missed Objections ({result.rebuttals.missed?.length || 0})
                    </h3>
                    {result.rebuttals.missed?.length > 0 ? (
                      <div className="space-y-3">
                        {result.rebuttals.missed.map((item: any, i: number) => (
                          <div key={i} className="border-2 border-red-300 rounded-lg p-4 bg-red-50">
                            <div className="text-base font-semibold text-gray-700 mb-2">
                              [{item.ts}] {item.stall_type}
                            </div>
                            <div className="text-base text-gray-800">
                              <span className="font-semibold">Customer:</span> "{item.quote_customer}"
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-base text-gray-600">No missed objections</p>
                    )}
                  </div>

                  {/* Immediate */}
                  {result.rebuttals.immediate && result.rebuttals.immediate.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold mb-3 text-blue-700">
                        ⚡ Immediate Responses ({result.rebuttals.immediate.length})
                      </h3>
                      <div className="space-y-3">
                        {result.rebuttals.immediate.map((item: any, i: number) => (
                          <div key={i} className="border-2 border-blue-300 rounded-lg p-4 bg-blue-50">
                            <div className="text-base font-semibold text-gray-700 mb-2">
                              [{item.ts}] {item.stall_type}
                            </div>
                            <div className="space-y-2">
                              <div className="text-base text-gray-800">
                                <span className="font-semibold">Customer:</span> "{item.quote_customer}"
                              </div>
                              <div className="text-base text-gray-800">
                                <span className="font-semibold">Agent (within 15s):</span>
                                "{item.quote_agent_immediate || 'No immediate response'}"
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Red Flags */}
          {result.analysis?.red_flags?.length > 0 && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">⚠️ Red Flags</h2>
                <div className="flex flex-wrap gap-3">
                  {result.analysis.red_flags.map((flag: string, i: number) => (
                    <span key={i} className="px-4 py-2 bg-red-100 text-red-800 rounded-full text-base font-semibold">
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Talk Metrics */}
          {result.talk_metrics && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Talk Metrics</h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {(() => {
                    const fmt = (sec: number) => {
                      if (!Number.isFinite(sec) || sec <= 0) return "0s";
                      const m = Math.floor(sec / 60);
                      const s = Math.floor(sec % 60);
                      if (m > 0) return `${m}m ${s}s`;
                      return `${s}s`;
                    };
                    const tm = result.talk_metrics;
                    return (
                      <>
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <label className="text-base font-semibold text-gray-700 block mb-1">Agent Talk Time</label>
                          <div className="text-xl font-bold text-blue-600">
                            {fmt(tm.talk_time_agent_sec)}
                          </div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg">
                          <label className="text-base font-semibold text-gray-700 block mb-1">Customer Talk Time</label>
                          <div className="text-xl font-bold text-green-600">
                            {fmt(tm.talk_time_customer_sec)}
                          </div>
                        </div>
                        <div className="bg-yellow-50 p-4 rounded-lg">
                          <label className="text-base font-semibold text-gray-700 block mb-1">Silence Time</label>
                          <div className="text-xl font-bold text-yellow-600">
                            {fmt(tm.silence_time_sec)}
                          </div>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg">
                          <label className="text-base font-semibold text-gray-700 block mb-1">Interruptions</label>
                          <div className="text-xl font-bold text-purple-600">
                            {tm.interrupt_count}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Talk Ratio Bar */}
                {(() => {
                  const tm = result.talk_metrics;
                  const total = tm.talk_time_agent_sec + tm.talk_time_customer_sec + tm.silence_time_sec;
                  if (total > 0) {
                    const agentPct = Math.round((tm.talk_time_agent_sec / total) * 100);
                    const custPct = Math.round((tm.talk_time_customer_sec / total) * 100);
                    const silencePct = Math.round((tm.silence_time_sec / total) * 100);
                    return (
                      <div className="mt-6">
                        <label className="text-base font-semibold text-gray-700 block mb-2">Talk Distribution</label>
                        <div className="flex h-8 rounded-lg overflow-hidden">
                          {agentPct > 0 && (
                            <div className="bg-blue-500 flex items-center justify-center text-white text-xs font-semibold"
                                 style={{width: `${agentPct}%`}}>
                              {agentPct}%
                            </div>
                          )}
                          {custPct > 0 && (
                            <div className="bg-green-500 flex items-center justify-center text-white text-xs font-semibold"
                                 style={{width: `${custPct}%`}}>
                              {custPct}%
                            </div>
                          )}
                          {silencePct > 0 && (
                            <div className="bg-gray-400 flex items-center justify-center text-white text-xs font-semibold"
                                 style={{width: `${silencePct}%`}}>
                              {silencePct}%
                            </div>
                          )}
                        </div>
                        <div className="flex justify-between text-xs text-gray-600 mt-1">
                          <span>Agent: {agentPct}%</span>
                          <span>Customer: {custPct}%</span>
                          <span>Silence: {silencePct}%</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">Analysis Metadata</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Model</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.metadata?.model || '—'}
                  </div>
                </div>
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Duration</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.duration ? `${Math.round(result.duration)}s` : '—'}
                  </div>
                </div>
                <div>
                  <label className="text-base font-semibold text-gray-700 block mb-1">Utterances</label>
                  <div className="text-lg font-medium text-gray-800">
                    {result.utterance_count || '—'}
                  </div>
                </div>
              </div>

              {result.metadata?.deepgram_request_id && (
                <div className="mt-4">
                  <label className="text-base font-semibold text-gray-700 block mb-1">Deepgram Request ID</label>
                  <div className="text-sm font-mono text-gray-600">
                    {result.metadata.deepgram_request_id}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Transcript */}
          {result.transcript && (
            <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900">Transcript</h2>
                <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-base text-gray-800 font-sans">
                    {result.transcript}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Raw Data */}
          <div className="bg-white border border-gray-300 rounded-lg shadow-lg">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-2 text-gray-900">Raw Response Data</h2>
              <p className="text-gray-700 text-base mb-4">Full API response for debugging</p>
              <div className="bg-gray-900 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm text-green-400 font-mono">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}