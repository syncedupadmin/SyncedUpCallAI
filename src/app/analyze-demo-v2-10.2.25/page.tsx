"use client";
import { useState } from "react";
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SuperAdminNav from '@/components/SuperAdminNav';
import {
  Phone,
  Loader2,
  AlertCircle,
  PlayCircle,
  FileAudio,
  Sparkles,
  CheckCircle,
  XCircle,
  TrendingUp,
  Shield,
  ExternalLink,
  Calendar
} from 'lucide-react';

export default function AnalyzeDemoV2() {
  const [url, setUrl] = useState("");
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setLoading(true);
    setErr(null);
    setData(null);

    try {
      const r = await fetch("/api/analyze-v2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          audioUrl: url,
          meta: {
            test_call: true,
            agent_id: "test-agent",
            campaign: "Test Campaign"
          }
        })
      });

      const raw = await r.text();
      let j: any;
      try {
        j = JSON.parse(raw);
      } catch {
        setErr(`HTTP ${r.status}. Body: ${raw.slice(0, 200)}`);
        return;
      }

      if (!r.ok) {
        setErr(j?.error || `HTTP ${r.status}`);
        return;
      }

      setData(j.data);

      // Log v2 debug information to console
      console.log('=== V2 ANALYSIS DEBUG INFO ===');
      console.log('Opening Quality:', j.data?.opening_quality);
      console.log('Opening Score:', j.data?.opening_score);
      console.log('Compliance Status:', j.data?.compliance_status);
      console.log('Outcome:', j.data?.outcome);
      console.log('Duration (ms):', j.data?.duration_ms);
      console.log('Analysis Version:', j.data?.analysis_version);
      console.log('Full Data:', j.data);
      console.log('===========================');

    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  const getOpeningQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'from-green-500 to-emerald-500';
      case 'good': return 'from-blue-500 to-cyan-500';
      case 'needs_improvement': return 'from-orange-500 to-yellow-500';
      case 'poor': return 'from-red-500 to-pink-500';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  const getComplianceColor = (status: string) => {
    switch (status) {
      case 'passed': return 'from-green-500 to-emerald-500';
      case 'partial': return 'from-yellow-500 to-orange-500';
      case 'failed': return 'from-red-500 to-pink-500';
      case 'not_applicable': return 'from-gray-500 to-gray-600';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <SuperAdminNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-3">
                  <Phone className="w-8 h-8 text-purple-500" />
                  V2 Call Analysis (3-Pass Sequential)
                </h1>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-medium">
                  <Calendar className="w-3 h-3" />
                  Updated: 10.2.25
                </span>
              </div>
              <p className="mt-2 text-gray-400">
                Advanced 3-pass analysis with opening quality scoring & post-close compliance verification
              </p>
            </div>
          </div>
        </div>

        {/* Input Section */}
        <div className="mb-8 p-6 rounded-xl bg-gray-800/30 backdrop-blur-sm border border-gray-700/50">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Recording URL
              </label>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <FileAudio className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="Paste MP3 URL from Convoso or other source..."
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                  />
                </div>
                <button
                  className="px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
                    bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-purple-500/25"
                  onClick={run}
                  disabled={!url || loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Analyze Call (V2)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Example URLs */}
            <div className="text-xs text-gray-500">
              <span className="font-medium">Example formats:</span>
              <span className="ml-2">https://admin-dt.convoso.com/play-recording-public/...</span>
            </div>
          </div>

          {/* Error Display */}
          {err && (
            <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-300">{err}</div>
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-purple-500/20 rounded-full"></div>
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-purple-500 rounded-full animate-spin border-t-transparent"></div>
            </div>
            <p className="mt-4 text-gray-400">Running 3-pass analysis...</p>
            <p className="mt-2 text-sm text-gray-500">Pass 1: Extraction • Pass 2: Opening & Compliance • Pass 3: White Card</p>
          </div>
        )}

        {/* V2 Analysis Results */}
        {data && !loading && (
          <div className="animate-fade-in space-y-6">
            <div className="flex items-center gap-2 text-gray-400">
              <PlayCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm">V2 Analysis Complete • {data.duration_ms}ms</span>
            </div>

            {/* Opening Quality & Compliance Badges */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Opening Quality */}
              {data.opening_quality && (
                <div className={`p-6 rounded-xl bg-gradient-to-r ${getOpeningQualityColor(data.opening_quality)}/10 border border-${data.opening_quality === 'excellent' ? 'green' : data.opening_quality === 'good' ? 'blue' : data.opening_quality === 'needs_improvement' ? 'orange' : 'red'}-500/30`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-white" />
                      <span className="text-sm font-medium text-gray-300">Opening Quality</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full bg-gradient-to-r ${getOpeningQualityColor(data.opening_quality)} text-white text-xs font-bold uppercase`}>
                      {data.opening_quality}
                    </span>
                  </div>
                  <div className="text-3xl font-bold text-white">{data.opening_score}/100</div>
                  <Link
                    href={`/admin/openings`}
                    className="mt-3 inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>View Opening Analysis</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}

              {/* Compliance Status */}
              {data.compliance_status && (
                <div className={`p-6 rounded-xl bg-gradient-to-r ${getComplianceColor(data.compliance_status)}/10 border border-${data.compliance_status === 'passed' ? 'green' : data.compliance_status === 'partial' ? 'yellow' : data.compliance_status === 'failed' ? 'red' : 'gray'}-500/30`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-white" />
                      <span className="text-sm font-medium text-gray-300">Post-Close Compliance</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full bg-gradient-to-r ${getComplianceColor(data.compliance_status)} text-white text-xs font-bold uppercase`}>
                      {data.compliance_status}
                    </span>
                  </div>
                  {data.compliance_details && (
                    <div className="text-3xl font-bold text-white">
                      {Math.round(data.compliance_details.overall_score)}%
                    </div>
                  )}
                  <Link
                    href={`/admin/post-close`}
                    className="mt-3 inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>View Compliance Details</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}
            </div>

            {/* Main Analysis Card */}
            <div className="p-6 rounded-xl bg-gray-800/30 backdrop-blur-sm border border-gray-700/50">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                {data.outcome === 'sale' && <CheckCircle className="w-5 h-5 text-green-500" />}
                {data.outcome === 'no_sale' && <XCircle className="w-5 h-5 text-red-500" />}
                {data.outcome === 'callback' && <Phone className="w-5 h-5 text-yellow-500" />}
                Call Outcome: {data.outcome?.toUpperCase()}
              </h3>

              {/* Summary */}
              {data.summary && (
                <div className="mb-6 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <p className="text-gray-300 leading-relaxed">{data.summary}</p>
                </div>
              )}

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {data.monthly_premium !== null && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Monthly Premium</div>
                    <div className="text-lg font-bold text-white">${data.monthly_premium}</div>
                  </div>
                )}
                {data.enrollment_fee !== null && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Enrollment Fee</div>
                    <div className="text-lg font-bold text-white">${data.enrollment_fee}</div>
                  </div>
                )}
                {data.policy_details?.carrier && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Carrier</div>
                    <div className="text-lg font-bold text-white">{data.policy_details.carrier}</div>
                  </div>
                )}
                {data.policy_details?.plan_type && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Plan Type</div>
                    <div className="text-lg font-bold text-white">{data.policy_details.plan_type}</div>
                  </div>
                )}
              </div>

              {/* Reason */}
              {data.reason && (
                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-1">Reason</div>
                  <div className="text-sm text-gray-300">{data.reason}</div>
                </div>
              )}

              {/* Red Flags */}
              {data.red_flags && data.red_flags.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-2">Red Flags</div>
                  <div className="flex flex-wrap gap-2">
                    {data.red_flags.map((flag: string, i: number) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-medium">
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Talk Metrics */}
              {data.talk_metrics && (
                <div className="pt-4 border-t border-gray-700">
                  <div className="text-xs text-gray-500 mb-2">Talk Metrics</div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Agent:</span>
                      <span className="ml-2 text-white">{Math.round(data.talk_metrics.talk_time_agent_sec)}s</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Customer:</span>
                      <span className="ml-2 text-white">{Math.round(data.talk_metrics.talk_time_customer_sec)}s</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Ratio:</span>
                      <span className="ml-2 text-white">{data.talk_metrics.talk_ratio?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Technical Info */}
            <div className="p-4 rounded-lg bg-gray-800/20 border border-gray-700/30">
              <div className="text-xs text-gray-500">
                <div>Analysis Version: <span className="text-gray-400 font-mono">{data.analysis_version}</span></div>
                <div className="mt-1">Duration: <span className="text-gray-400 font-mono">{data.duration_ms}ms</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Info Box */}
        {!data && !loading && (
          <div className="mt-8 p-6 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
            <h3 className="text-lg font-semibold text-white mb-3">V2 3-Pass Analysis System:</h3>
            <ol className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">Pass 1:</span>
                <span>Comprehensive extraction - money, plans, carriers, dates, objections, opening & post-close segments</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">Pass 2:</span>
                <span>Opening quality analysis (pace, greeting, control) + post-close compliance verification (fuzzy matching)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">Pass 3:</span>
                <span>Final white card with full context - generates outcome referencing opening quality & compliance status</span>
              </li>
            </ol>
            <p className="mt-4 text-xs text-gray-500">
              ✨ Uses OpenAI Structured Outputs (strict: true) for 100% reliability • Check browser console for debug data
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
