"use client";
import { useState } from "react";
import { useRouter } from 'next/navigation';
import SuperAdminNav from '@/components/SuperAdminNav';
import { usePrefs } from "@/components/PrefsProvider";
import PreferencesPanel from "@/components/PreferencesPanel";
import CallAnalysisCard, { Analysis } from "@/components/CallAnalysisCard";
import {
  Phone,
  Upload,
  Loader2,
  AlertCircle,
  Settings,
  PlayCircle,
  FileAudio,
  Sparkles,
  ArrowRight,
  Info
} from 'lucide-react';

export default function AnalyzeDemo() {
  const { prefs } = usePrefs();
  const [url, setUrl] = useState("");
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const router = useRouter();

  async function run() {
    setLoading(true);
    setErr(null);
    setData(null);

    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recording_url: url,
          meta: {
            agent_id: "Unknown",
            campaign: "Test",
            duration_sec: 0,
            disposition: "Unknown",
            direction: "outbound"
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

      // Accept 422 if it has data (validation errors but still usable)
      if (!r.ok && r.status !== 200 && r.status !== 422) {
        setErr(j?.error || `HTTP ${r.status}`);
        return;
      }

      // If 422 with error but no data, show error
      if (r.status === 422 && j?.error && !j?.validation) {
        setErr(j.error);
        return;
      }

      // Accept partial data with validation flag or 422 with data
      const analysisData = j.validation === "failed" && j.partial ? j.partial : j;
      setData(analysisData);

      // Log debug information to console
      if (j.debug) {
        console.log('=== ANALYSIS DEBUG INFO ===');
        console.log('Segment count:', j.debug.segmentCount);
        console.log('Has segments:', j.debug.hasSegments);
        console.log('ASR quality:', j.debug.asrQuality);
        console.log('Key phrases found:', j.debug.keyPhrasesCount);
        console.log('Conversation metrics:', j.debug.conversationMetrics);
        console.log('Sales metrics:', j.debug.salesMetrics);
        console.log('URL processed:', j.debug.url);
        if (j.debug.voicemail_trigger) {
          console.log('⚠️ VOICEMAIL DETECTED - Trigger:', j.debug.voicemail_trigger);
          console.log('First segment:', j.debug.first_segment);
        }
        console.log('===========================');
      }

      // Log enriched signals to console
      console.log('Analysis completed. Check console for enriched signals sent to OpenAI.');

    } catch (e:any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <SuperAdminNav />

      {/* Deprecation Banner */}
      <div className="bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-yellow-500/20 border-b border-yellow-500/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Info className="w-5 h-5 text-yellow-400 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-yellow-100">
                  V1 Legacy System - Upgrade Available
                </div>
                <div className="text-xs text-yellow-200/70">
                  This is the legacy 2-pass analysis system. Try our new 3-pass sequential analysis for improved accuracy.
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push('/analyze-demo-v2-10.2.25')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-sm font-medium transition-all shadow-lg hover:shadow-purple-500/25 whitespace-nowrap"
            >
              <span>Try V2 Analysis</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Phone className="w-8 h-8 text-purple-500" />
                Test Call Analysis
              </h1>
              <p className="mt-2 text-gray-400">
                Upload an MP3 recording or paste a URL to analyze the call with AI
              </p>
            </div>

            <button
              onClick={() => setShowPrefs(!showPrefs)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-all text-gray-300 hover:text-white"
            >
              <Settings className="w-4 h-4" />
              <span>Preferences</span>
            </button>
          </div>
        </div>

        {/* Preferences Panel */}
        {showPrefs && (
          <div className="mb-6 p-4 rounded-xl bg-gray-800/30 backdrop-blur-sm border border-gray-700/50">
            <PreferencesPanel />
          </div>
        )}

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
                      <span>Analyze Call</span>
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
            <p className="mt-4 text-gray-400">Transcribing and analyzing call...</p>
            <p className="mt-2 text-sm text-gray-500">This may take 10-30 seconds</p>
          </div>
        )}

        {/* Analysis Results */}
        {data && !loading && (
          <div className="animate-fade-in">
            <div className="mb-4 flex items-center gap-2 text-gray-400">
              <PlayCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm">Analysis Complete</span>
            </div>

            <CallAnalysisCard
              data={data}
              showActions={prefs.showActions}
              showCustomerQuotes={prefs.showCustomerQuotes}
              showRebuttalScores={prefs.showRebuttalScores}
              compactUI={prefs.compactUI}
            />
          </div>
        )}

        {/* Info Box */}
        {!data && !loading && (
          <div className="mt-8 p-6 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
            <h3 className="text-lg font-semibold text-white mb-3">How it works:</h3>
            <ol className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">1.</span>
                <span>Paste a recording URL from Convoso or upload an MP3 file</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">2.</span>
                <span>Deepgram transcribes the call with advanced speech recognition</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">3.</span>
                <span>Our AI extracts signals, rebuttals, prices, and opening scores</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">4.</span>
                <span>OpenAI analyzes the enriched data to generate insights</span>
              </li>
            </ol>
            <p className="mt-4 text-xs text-gray-500">
              Check browser console for detailed signal data sent to OpenAI
            </p>
          </div>
        )}
      </div>
    </div>
  );
}