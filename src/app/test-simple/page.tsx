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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="mb-10">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            Simple Analysis Tool
          </h1>
          <p className="text-gray-400 text-lg">Clean AI analysis without rule engine interference</p>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-8 mb-8 border border-gray-700">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Recording URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://admin-dt.convoso.com/play-recording-public/..."
            className="w-full p-4 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none text-base font-mono"
          />

          <button
            onClick={analyze}
            disabled={loading || !url}
            className={`mt-6 px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 ${
              loading || !url
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg'
            }`}
          >
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analyzing Call...
              </span>
            ) : (
              'Analyze Recording'
            )}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-6 py-4 rounded-lg mb-8">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {/* Analysis Summary */}
            {result.analysis && (
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-8 border border-gray-700">
                <h2 className="text-2xl font-bold mb-6 text-blue-400">Analysis Results</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Outcome</p>
                    <p className={`text-2xl font-bold ${
                      result.analysis.outcome === 'sale' ? 'text-green-400' :
                      result.analysis.outcome === 'no_sale' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      {result.analysis.outcome?.toUpperCase()}
                    </p>
                  </div>

                  {result.analysis.monthly_premium && (
                    <div>
                      <p className="text-gray-400 text-sm mb-1">Monthly Premium</p>
                      <p className="text-2xl font-bold text-green-400">
                        ${result.analysis.monthly_premium}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <p className="text-gray-400 text-sm mb-2">Reason</p>
                  <p className="text-lg">{result.analysis.reason}</p>
                </div>

                <div className="mb-6">
                  <p className="text-gray-400 text-sm mb-2">Summary</p>
                  <p className="text-base text-gray-300">{result.analysis.summary}</p>
                </div>

                {result.analysis.customer_name && (
                  <div className="mb-6">
                    <p className="text-gray-400 text-sm mb-1">Customer</p>
                    <p className="text-lg">{result.analysis.customer_name}</p>
                  </div>
                )}

                {result.analysis.policy_details && (
                  <div className="mb-6">
                    <p className="text-gray-400 text-sm mb-2">Policy Details</p>
                    <div className="pl-4 space-y-1">
                      {result.analysis.policy_details.carrier && (
                        <p><span className="text-gray-500">Carrier:</span> {result.analysis.policy_details.carrier}</p>
                      )}
                      {result.analysis.policy_details.plan_type && (
                        <p><span className="text-gray-500">Plan Type:</span> {result.analysis.policy_details.plan_type}</p>
                      )}
                      {result.analysis.policy_details.effective_date && (
                        <p><span className="text-gray-500">Effective Date:</span> {result.analysis.policy_details.effective_date}</p>
                      )}
                    </div>
                  </div>
                )}

                {result.analysis.enrollment_fee && (
                  <div className="mb-6">
                    <p className="text-gray-400 text-sm mb-1">Enrollment Fee</p>
                    <p className="text-xl font-bold text-yellow-400">${result.analysis.enrollment_fee}</p>
                  </div>
                )}

                {result.analysis.red_flags && result.analysis.red_flags.length > 0 && (
                  <div>
                    <p className="text-gray-400 text-sm mb-2">Red Flags</p>
                    <ul className="list-disc list-inside text-red-400">
                      {result.analysis.red_flags.map((flag: string, i: number) => (
                        <li key={i}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Price Corrections */}
            {result.price_events && result.price_events.some((e: any) => e.corrected) && (
              <div className="bg-yellow-900/20 backdrop-blur-sm rounded-lg p-6 border border-yellow-600/30">
                <h3 className="text-lg font-semibold mb-4 text-yellow-400">🎯 Price Corrections Applied</h3>
                <div className="space-y-2">
                  {result.price_events.filter((e: any) => e.corrected).map((event: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-red-400 line-through">{event.quote}</span>
                      <span className="text-gray-500">→</span>
                      <span className="text-green-400 font-bold">${event.value}</span>
                      <span className="text-gray-500 text-xs">({event.reason})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deepgram Summary */}
            {result.deepgram_summary && (
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold mb-4 text-purple-400">Deepgram AI Summary</h3>
                <p className="text-base text-gray-300">{result.deepgram_summary}</p>
              </div>
            )}

            {/* Metadata */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-gray-300">Call Metadata</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-gray-500 text-sm">Utterances</p>
                  <p className="text-xl font-semibold">{result.utterance_count}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Duration</p>
                  <p className="text-xl font-semibold">
                    {Math.floor(result.duration / 60)}:{String(Math.floor(result.duration % 60)).padStart(2, '0')}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Model</p>
                  <p className="text-xl font-semibold">{result.metadata?.model}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Processed</p>
                  <p className="text-sm">{new Date(result.metadata?.processed_at).toLocaleTimeString()}</p>
                </div>
              </div>
            </div>

            {/* Transcript */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold mb-4 text-gray-300">Full Transcript</h3>
              <pre className="whitespace-pre-wrap text-sm text-gray-400 font-mono max-h-96 overflow-y-auto">
                {result.transcript}
              </pre>
            </div>

            {/* Raw JSON */}
            <details className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700">
              <summary className="p-6 cursor-pointer hover:bg-gray-700/50 text-gray-300 font-semibold">
                View Raw JSON Response
              </summary>
              <pre className="p-6 text-sm text-gray-400 overflow-x-auto font-mono">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}