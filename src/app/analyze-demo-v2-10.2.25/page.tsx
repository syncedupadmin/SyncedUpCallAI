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
  Calendar,
  ChevronDown,
  FileText,
  Tag,
  MessageSquare,
  Database,
  Cpu
} from 'lucide-react';

export default function AnalyzeDemoV2() {
  const [url, setUrl] = useState("");
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showOpeningDetails, setShowOpeningDetails] = useState(false);
  const [showComplianceDetails, setShowComplianceDetails] = useState(false);
  const [showEntities, setShowEntities] = useState(false);
  const [showRebuttalAnalysis, setShowRebuttalAnalysis] = useState(false);
  const [showPass1Details, setShowPass1Details] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
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
                  <button
                    onClick={() => setShowOpeningDetails(!showOpeningDetails)}
                    className="mt-3 inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>{showOpeningDetails ? 'Hide' : 'View'} Opening Analysis</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showOpeningDetails ? 'rotate-180' : ''}`} />
                  </button>

                  {showOpeningDetails && data.opening_analysis && (
                    <div className="mt-4 pt-4 border-t border-gray-700 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {data.opening_analysis.control_score !== undefined && (
                          <div>
                            <div className="text-xs text-gray-400">Control Score</div>
                            <div className="text-white font-medium">{data.opening_analysis.control_score}/100</div>
                          </div>
                        )}
                        {data.opening_analysis.greeting_type && (
                          <div>
                            <div className="text-xs text-gray-400">Greeting Type</div>
                            <div className="text-white font-medium">{data.opening_analysis.greeting_type}</div>
                          </div>
                        )}
                        {data.opening_analysis.pace_wpm && (
                          <div>
                            <div className="text-xs text-gray-400">Pace</div>
                            <div className="text-white font-medium">{data.opening_analysis.pace_wpm} WPM</div>
                          </div>
                        )}
                        {data.opening_analysis.company_mentioned !== undefined && (
                          <div>
                            <div className="text-xs text-gray-400">Company Mentioned</div>
                            <div className={`text-white font-medium ${data.opening_analysis.company_mentioned ? 'text-green-400' : 'text-red-400'}`}>
                              {data.opening_analysis.company_mentioned ? 'Yes' : 'No'}
                            </div>
                          </div>
                        )}
                        {data.opening_analysis.agent_name_mentioned !== undefined && (
                          <div>
                            <div className="text-xs text-gray-400">Agent Name Mentioned</div>
                            <div className={`text-white font-medium ${data.opening_analysis.agent_name_mentioned ? 'text-green-400' : 'text-red-400'}`}>
                              {data.opening_analysis.agent_name_mentioned ? 'Yes' : 'No'}
                            </div>
                          </div>
                        )}
                        {data.opening_analysis.value_prop_mentioned !== undefined && (
                          <div>
                            <div className="text-xs text-gray-400">Value Prop Mentioned</div>
                            <div className={`text-white font-medium ${data.opening_analysis.value_prop_mentioned ? 'text-green-400' : 'text-red-400'}`}>
                              {data.opening_analysis.value_prop_mentioned ? 'Yes' : 'No'}
                            </div>
                          </div>
                        )}
                        {data.opening_analysis.question_asked !== undefined && (
                          <div>
                            <div className="text-xs text-gray-400">Question Asked</div>
                            <div className={`text-white font-medium ${data.opening_analysis.question_asked ? 'text-green-400' : 'text-red-400'}`}>
                              {data.opening_analysis.question_asked ? 'Yes' : 'No'}
                            </div>
                          </div>
                        )}
                        {data.opening_analysis.rejection_detected !== undefined && (
                          <div>
                            <div className="text-xs text-gray-400">Early Rejection</div>
                            <div className={`text-white font-medium ${data.opening_analysis.rejection_detected ? 'text-red-400' : 'text-green-400'}`}>
                              {data.opening_analysis.rejection_detected ? 'Yes' : 'No'}
                            </div>
                          </div>
                        )}
                        {data.opening_analysis.rejection_type && (
                          <div>
                            <div className="text-xs text-gray-400">Rejection Type</div>
                            <div className="text-red-400 font-medium">{data.opening_analysis.rejection_type}</div>
                          </div>
                        )}
                        {data.opening_analysis.rebuttal_attempted !== undefined && (
                          <div>
                            <div className="text-xs text-gray-400">Rebuttal Attempted</div>
                            <div className={`text-white font-medium ${data.opening_analysis.rebuttal_attempted ? 'text-green-400' : 'text-yellow-400'}`}>
                              {data.opening_analysis.rebuttal_attempted ? 'Yes' : 'No'}
                            </div>
                          </div>
                        )}
                        {data.opening_analysis.rebuttal_quality && (
                          <div>
                            <div className="text-xs text-gray-400">Rebuttal Quality</div>
                            <div className={`text-white font-medium ${
                              data.opening_analysis.rebuttal_quality === 'effective' ? 'text-green-400' :
                              data.opening_analysis.rebuttal_quality === 'weak' ? 'text-yellow-400' :
                              'text-gray-400'
                            }`}>
                              {data.opening_analysis.rebuttal_quality}
                            </div>
                          </div>
                        )}
                        {data.opening_analysis.led_to_pitch !== undefined && (
                          <div>
                            <div className="text-xs text-gray-400">Led to Pitch</div>
                            <div className={`text-white font-medium ${data.opening_analysis.led_to_pitch ? 'text-green-400' : 'text-red-400'}`}>
                              {data.opening_analysis.led_to_pitch ? 'Yes' : 'No'}
                            </div>
                          </div>
                        )}
                      </div>
                      {data.opening_analysis.opening_feedback && data.opening_analysis.opening_feedback.length > 0 && (
                        <div>
                          <div className="text-xs text-cyan-400 mb-1">Opening Feedback</div>
                          <ul className="text-xs text-gray-300 space-y-1">
                            {data.opening_analysis.opening_feedback.map((feedback: string, i: number) => (
                              <li key={i}>• {feedback}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
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
                  <button
                    onClick={() => setShowComplianceDetails(!showComplianceDetails)}
                    className="mt-3 inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>{showComplianceDetails ? 'Hide' : 'View'} Compliance Details</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showComplianceDetails ? 'rotate-180' : ''}`} />
                  </button>

                  {showComplianceDetails && data.compliance_details && (
                    <div className="mt-4 pt-4 border-t border-gray-700 space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-gray-400">Word Match</div>
                          <div className="text-white font-medium">{Math.round(data.compliance_details.word_match_percentage)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Phrase Match</div>
                          <div className="text-white font-medium">{Math.round(data.compliance_details.phrase_match_percentage)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Sequence Score</div>
                          <div className="text-white font-medium">{Math.round(data.compliance_details.sequence_score)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Similarity Score</div>
                          <div className="text-white font-medium">{Math.round(data.compliance_details.similarity_score)}%</div>
                        </div>
                      </div>
                      {data.compliance_details.missing_required_phrases && data.compliance_details.missing_required_phrases.length > 0 && (
                        <div>
                          <div className="text-xs text-red-400 mb-1">Missing Required Phrases ({data.compliance_details.missing_required_phrases.length})</div>
                          <div className="max-h-32 overflow-y-auto">
                            <ul className="text-xs text-gray-300 space-y-1">
                              {data.compliance_details.missing_required_phrases.map((phrase: string, i: number) => (
                                <li key={i} className="text-red-300">• {phrase}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                      {data.compliance_details.paraphrased_sections && data.compliance_details.paraphrased_sections.length > 0 && (
                        <div>
                          <div className="text-xs text-yellow-400 mb-1">Paraphrased Sections ({data.compliance_details.paraphrased_sections.length})</div>
                          <div className="max-h-32 overflow-y-auto">
                            <ul className="text-xs text-gray-300 space-y-1">
                              {data.compliance_details.paraphrased_sections.slice(0, 3).map((section: any, i: number) => (
                                <li key={i} className="text-yellow-300">• {section.expected || section}</li>
                              ))}
                              {data.compliance_details.paraphrased_sections.length > 3 && (
                                <li className="text-gray-500">... and {data.compliance_details.paraphrased_sections.length - 3} more</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      )}
                      {data.compliance_details.script_name && (
                        <div className="pt-2 border-t border-gray-700/50">
                          <div className="text-xs text-gray-400">Script Used</div>
                          <div className="text-xs text-white font-medium">{data.compliance_details.script_name}</div>
                        </div>
                      )}
                    </div>
                  )}
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

            {/* Entities Section */}
            {data.entities && data.entities.length > 0 && (
              <div className="p-6 rounded-xl bg-gray-800/30 backdrop-blur-sm border border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Tag className="w-5 h-5 text-cyan-500" />
                    Deepgram Entities (Carrier Context)
                  </h3>
                  <button
                    onClick={() => setShowEntities(!showEntities)}
                    className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>{showEntities ? 'Hide' : 'Show'} ({data.entities.length})</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showEntities ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {showEntities && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {data.entities.map((entity: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-gray-900/50 border border-gray-700/30">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-white">{entity.value}</div>
                            <div className="text-xs text-gray-400 mt-1">
                              Type: <span className="text-cyan-400">{entity.label}</span> •
                              Speaker: <span className="text-purple-400">{entity.speaker || 'unknown'}</span> •
                              Time: <span className="text-yellow-400">{entity.startMs}ms</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Rebuttal Analysis Section */}
            {data.rebuttal_analysis && data.rebuttal_analysis.objections && data.rebuttal_analysis.objections.length > 0 && (
              <div className="p-6 rounded-xl bg-gray-800/30 backdrop-blur-sm border border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-orange-500" />
                    Rebuttal Analysis
                  </h3>
                  <button
                    onClick={() => setShowRebuttalAnalysis(!showRebuttalAnalysis)}
                    className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>{showRebuttalAnalysis ? 'Hide' : 'Show'} ({data.rebuttal_analysis.objections.length} objections)</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showRebuttalAnalysis ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {showRebuttalAnalysis && (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {data.rebuttal_analysis.objections.map((objection: any, i: number) => (
                      <div key={i} className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
                        <div className="flex items-start gap-3 mb-2">
                          <span className="px-2 py-1 rounded bg-orange-500/20 text-orange-300 text-xs font-medium uppercase">
                            {objection.stall_type}
                          </span>
                          <span className="text-xs text-gray-500">{objection.startMs}ms - {objection.endMs}ms</span>
                        </div>
                        <div className="text-sm text-gray-300 italic mb-2">"{objection.quote}"</div>
                        {data.rebuttal_analysis.agent_responses?.[i] && (
                          <div className="mt-2 pt-2 border-t border-gray-700/50">
                            <div className="text-xs text-gray-500 mb-1">Agent Response:</div>
                            <div className="text-sm text-gray-300">{data.rebuttal_analysis.agent_responses[i].text}</div>
                          </div>
                        )}
                        {data.rebuttal_analysis.classifications?.[i] && (
                          <div className="mt-2 pt-2 border-t border-gray-700/50">
                            <div className="text-xs text-gray-500 mb-1">Quality:</div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              data.rebuttal_analysis.classifications[i] === 'effective' ? 'bg-green-500/20 text-green-300' :
                              data.rebuttal_analysis.classifications[i] === 'weak' ? 'bg-yellow-500/20 text-yellow-300' :
                              'bg-gray-500/20 text-gray-300'
                            }`}>
                              {data.rebuttal_analysis.classifications[i]}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pass 1 Extraction Details */}
            {data.pass1_extraction && (
              <div className="p-6 rounded-xl bg-gray-800/30 backdrop-blur-sm border border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-purple-500" />
                    Pass 1: Extraction Details
                  </h3>
                  <button
                    onClick={() => setShowPass1Details(!showPass1Details)}
                    className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>{showPass1Details ? 'Hide' : 'Show'} Details</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showPass1Details ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {showPass1Details && (
                  <div className="space-y-4">
                    {/* Carrier Mentions */}
                    {data.pass1_extraction.carrier_mentions && data.pass1_extraction.carrier_mentions.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-gray-400 mb-2">Carrier Mentions ({data.pass1_extraction.carrier_mentions.length})</div>
                        <div className="space-y-2">
                          {data.pass1_extraction.carrier_mentions.map((mention: any, i: number) => (
                            <div key={i} className="p-2 rounded bg-blue-500/10 border border-blue-500/30">
                              <div className="text-sm text-white font-medium">{mention.carrier}</div>
                              <div className="text-xs text-gray-400 italic">"{mention.quote}"</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Plan Mentions */}
                    {data.pass1_extraction.plan_mentions && data.pass1_extraction.plan_mentions.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-gray-400 mb-2">Plan Mentions ({data.pass1_extraction.plan_mentions.length})</div>
                        <div className="space-y-2">
                          {data.pass1_extraction.plan_mentions.map((mention: any, i: number) => (
                            <div key={i} className="p-2 rounded bg-green-500/10 border border-green-500/30">
                              <div className="text-sm text-white font-medium">{mention.plan_type}</div>
                              <div className="text-xs text-gray-400 italic">"{mention.quote}"</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Money Mentions */}
                    {data.pass1_extraction.money_mentions && data.pass1_extraction.money_mentions.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-gray-400 mb-2">Money Mentions ({data.pass1_extraction.money_mentions.length})</div>
                        <div className="space-y-2">
                          {data.pass1_extraction.money_mentions.map((mention: any, i: number) => (
                            <div key={i} className="p-2 rounded bg-yellow-500/10 border border-yellow-500/30">
                              <div className="text-sm text-white font-medium">{mention.field_hint}: {mention.value_raw}</div>
                              <div className="text-xs text-gray-400">
                                Speaker: {mention.speaker} • "{mention.quote}"
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Date Mentions */}
                    {data.pass1_extraction.date_mentions && data.pass1_extraction.date_mentions.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-gray-400 mb-2">Date Mentions ({data.pass1_extraction.date_mentions.length})</div>
                        <div className="space-y-2">
                          {data.pass1_extraction.date_mentions.map((mention: any, i: number) => (
                            <div key={i} className="p-2 rounded bg-purple-500/10 border border-purple-500/30">
                              <div className="text-sm text-white font-medium">{mention.kind}: {mention.value_raw}</div>
                              <div className="text-xs text-gray-400 italic">"{mention.quote}"</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Transcript Section */}
            {data.transcript && (
              <div className="p-6 rounded-xl bg-gray-800/30 backdrop-blur-sm border border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-green-500" />
                    Full Transcript
                  </h3>
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <span>{showTranscript ? 'Hide' : 'Show'} Transcript</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showTranscript ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {showTranscript && (
                  <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-700/30 max-h-96 overflow-y-auto">
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">{data.transcript}</pre>
                  </div>
                )}
              </div>
            )}

            {/* Technical Info */}
            <div className="p-4 rounded-lg bg-gray-800/20 border border-gray-700/30">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-400">Performance Metrics</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-500">
                <div>
                  <div className="text-gray-600">Version</div>
                  <div className="text-gray-400 font-mono">{data.analysis_version}</div>
                </div>
                <div>
                  <div className="text-gray-600">Total Duration</div>
                  <div className="text-gray-400 font-mono">{data.duration_ms}ms</div>
                </div>
                {data.timing && (
                  <>
                    <div>
                      <div className="text-gray-600">Deepgram</div>
                      <div className="text-gray-400 font-mono">{data.timing.deepgram_ms}ms</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Pass 1</div>
                      <div className="text-gray-400 font-mono">{data.timing.openai_pass1_ms}ms</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Pass 2</div>
                      <div className="text-gray-400 font-mono">{data.timing.openai_pass2_ms}ms</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Pass 3</div>
                      <div className="text-gray-400 font-mono">{data.timing.openai_pass3_ms}ms</div>
                    </div>
                  </>
                )}
                {data.tokens && (
                  <>
                    <div>
                      <div className="text-gray-600">Input Tokens</div>
                      <div className="text-gray-400 font-mono">{data.tokens.total_input}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Output Tokens</div>
                      <div className="text-gray-400 font-mono">{data.tokens.total_output}</div>
                    </div>
                  </>
                )}
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
