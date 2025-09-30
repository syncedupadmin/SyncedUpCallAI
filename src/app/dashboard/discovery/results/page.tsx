'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  TrendingUp, Phone, XCircle, Activity, Zap,
  CheckCircle, AlertCircle, Loader2, ArrowRight
} from 'lucide-react';
import toast from 'react-hot-toast';

interface DiscoveryMetrics {
  closeRate: number;
  pitchesDelivered: number;
  successfulCloses: number;
  openingScore: number;
  rebuttalFailures: number;
  hangupRate: number;
  earlyHangups: number;
  lyingDetected: number;
  totalCallsProcessed: number;
}

function DiscoveryResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('initializing');
  const [processedCalls, setProcessedCalls] = useState(0);
  const [totalCalls, setTotalCalls] = useState(0);
  const [metrics, setMetrics] = useState<DiscoveryMetrics | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || sessionId === 'undefined') {
      toast.error('Invalid discovery session');
      router.push('/dashboard/discovery');
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/discovery/progress?sessionId=${sessionId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch progress');
        }

        const data = await response.json();

        setStatus(data.status);
        setProgress(data.progress || 0);
        setProcessedCalls(data.processed || 0);
        setTotalCalls(data.total || 0);
        setMetrics(data.metrics);
        setInsights(data.insights || []);

        if (data.complete) {
          clearInterval(pollInterval);
          setLoading(false);

          // Mark discovery as complete in agency table
          await completeDiscovery();
        }

        if (data.error) {
          setError(data.error);
          clearInterval(pollInterval);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('[Discovery Results] Polling error:', err);
        // Don't stop polling on network errors
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [sessionId]);

  const completeDiscovery = async () => {
    const supabase = createClient();

    try {
      // Get user's agency
      const { data: membership } = await supabase
        .from('user_agencies')
        .select('agency_id')
        .single();

      if (membership?.agency_id) {
        // Update agency discovery status to completed
        await supabase
          .from('agencies')
          .update({ discovery_status: 'completed' })
          .eq('id', membership.agency_id);
      }
    } catch (error) {
      console.error('[Discovery Results] Error marking complete:', error);
    }
  };

  const handleContinue = () => {
    toast.success('Discovery complete! Welcome to your dashboard.');
    router.push('/dashboard');
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'initializing':
        return 'Initializing discovery engine...';
      case 'pulling':
        return `Fetching calls from Convoso... (${processedCalls}/${totalCalls})`;
      case 'analyzing':
        return `Analyzing patterns... (${processedCalls}/${totalCalls} calls)`;
      case 'complete':
        return 'Analysis complete!';
      default:
        return 'Processing...';
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Discovery Failed</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => router.push('/dashboard/discovery')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">
            {loading ? 'Analyzing Your Calls' : 'Discovery Complete!'}
          </h1>
          <p className="text-gray-400">
            {loading ? getStatusMessage() : 'Here\'s what we learned about your call patterns'}
          </p>
        </div>

        {/* Progress Bar */}
        {loading && (
          <div className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-800">
            <div className="flex justify-between text-sm mb-2">
              <span>Processing calls...</span>
              <span>{progress}%</span>
            </div>
            <div className="bg-gray-700 rounded-full h-3 overflow-hidden mb-4">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{status}</span>
            </div>
          </div>
        )}

        {/* Insights Feed */}
        {insights.length > 0 && (
          <div className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-800">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              {loading ? 'Emerging Insights' : 'Key Insights'}
            </h2>
            <div className="space-y-3">
              {insights.slice(-5).map((insight, idx) => (
                <div key={idx} className="flex items-start gap-2 text-gray-300">
                  <CheckCircle className="w-4 h-4 text-green-400 mt-1 flex-shrink-0" />
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results Dashboard (shown when complete) */}
        {!loading && metrics && (
          <>
            {/* Hero Metric */}
            <div className="bg-gradient-to-r from-green-900/50 to-emerald-900/50 rounded-xl p-8 mb-8 border border-green-800">
              <div className="text-center">
                <div className="text-7xl font-bold mb-2">
                  {(metrics.closeRate || 0).toFixed(1)}%
                </div>
                <div className="text-xl text-green-100">Your Closing Rate</div>
                <div className="text-sm text-green-200 mt-4">
                  {metrics.successfulCloses} closes from {metrics.pitchesDelivered} pitches
                  <span className="text-green-300 mx-2">•</span>
                  {metrics.totalCallsProcessed} calls analyzed
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="flex items-center gap-2 mb-4">
                  <Phone className="w-5 h-5 text-blue-400" />
                  <span className="text-sm text-gray-400">Opening Score</span>
                </div>
                <div className="text-3xl font-bold">{metrics.openingScore}/100</div>
                <div className="text-xs text-gray-500 mt-2">
                  Quality of agent openings
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="flex items-center gap-2 mb-4">
                  <XCircle className="w-5 h-5 text-yellow-400" />
                  <span className="text-sm text-gray-400">Rebuttal Failures</span>
                </div>
                <div className="text-3xl font-bold">{metrics.rebuttalFailures}</div>
                <div className="text-xs text-gray-500 mt-2">
                  Calls where agents didn't attempt rebuttals
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <span className="text-sm text-gray-400">Early Hangups</span>
                </div>
                <div className="text-3xl font-bold">{metrics.earlyHangups}</div>
                <div className="text-xs text-gray-500 mt-2">
                  Calls ending in first 15 seconds ({(metrics.hangupRate || 0).toFixed(1)}%)
                </div>
              </div>
            </div>

            {/* Lying Detection Alert */}
            {metrics.lyingDetected > 0 && (
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-6 mb-8">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-red-300 mb-2">
                      Potential Deception Patterns Detected
                    </h3>
                    <p className="text-sm text-gray-300 mb-3">
                      Found {metrics.lyingDetected} instances of potential misrepresentation:
                    </p>
                    <ul className="space-y-1 text-sm text-gray-400">
                      <li>• "Free" services that require paid membership</li>
                      <li>• Benefits described as "included" but billed separately</li>
                      <li>• Misleading pricing or coverage statements</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Continue Button */}
            <div className="text-center">
              <button
                onClick={handleContinue}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-colors inline-flex items-center gap-2"
              >
                Continue to Dashboard
                <ArrowRight className="w-5 h-5" />
              </button>
              <p className="text-sm text-gray-500 mt-4">
                You can view detailed analytics and coaching insights in your dashboard
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function DiscoveryResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    }>
      <DiscoveryResultsContent />
    </Suspense>
  );
}