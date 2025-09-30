'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Key, AlertCircle, ChevronRight, Loader2, HelpCircle, Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

function DiscoverySetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [agencyName, setAgencyName] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [error, setError] = useState('');
  const isRetry = searchParams.get('retry') === 'true';

  useEffect(() => {
    // Get agency name for personalization
    const fetchAgency = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('user_agencies')
          .select('agencies!inner(name)')
          .eq('user_id', user.id)
          .single();
        if (data) {
          const agencies = (data as any).agencies;
          if (agencies?.name) {
            setAgencyName(agencies.name);
          }
        }
      }
    };
    fetchAgency();
  }, []);

  const validateForm = () => {
    if (!authToken.trim()) {
      setError('Auth Token is required');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);

    try {
      const response = await fetch('/api/discovery/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          convoso_auth_token: authToken.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start discovery');
      }

      // Handle skipped discovery (insufficient data)
      if (data.skipped) {
        toast.error(data.reason || 'Not enough data to run discovery');
        setLoading(false);
        router.push(data.redirectTo || '/dashboard');
        return;
      }

      toast.success('Discovery started! Analyzing your calls...');
      router.push(`/dashboard/discovery/results?session=${data.sessionId}`);
    } catch (error: any) {
      toast.error(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            {isRetry ? 'Retry Discovery Setup' : `Welcome to SyncedUp${agencyName ? `, ${agencyName}` : ''}!`}
          </h1>
          <p className="text-xl text-gray-400">
            Let's connect to your Convoso account and analyze your call performance
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-2">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                1
              </div>
              <span className="ml-2 text-white font-medium">Connect Convoso</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500 mx-2" />
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-gray-700 text-gray-400 flex items-center justify-center font-bold">
                2
              </div>
              <span className="ml-2 text-gray-400">Analyze Calls</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500 mx-2" />
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-gray-700 text-gray-400 flex items-center justify-center font-bold">
                3
              </div>
              <span className="ml-2 text-gray-400">View Insights</span>
            </div>
          </div>
        </div>

        {/* Main Form */}
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-800 shadow-xl">
          {isRetry && (
            <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                <div>
                  <p className="text-yellow-200 font-medium">Previous attempt failed</p>
                  <p className="text-yellow-300/80 text-sm mt-1">
                    Please verify your Convoso credentials and try again
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
              <Key className="w-6 h-6 text-blue-500" />
              Enter Your Convoso Auth Token
            </h2>
            <p className="text-gray-400">
              We'll use this to securely access and analyze your last 2,500 calls
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Auth Token Field */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Convoso Auth Token
                <button
                  type="button"
                  className="ml-2 text-gray-500 hover:text-gray-300"
                  title="Find this in Convoso Admin → Settings → API"
                >
                  <HelpCircle className="w-4 h-4 inline" />
                </button>
              </label>
              <div className="relative">
                <input
                  type={showAuthToken ? "text" : "password"}
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  className={`w-full bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-700'} rounded-lg px-4 py-3 pr-12 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none`}
                  placeholder="Enter your Convoso auth token"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowAuthToken(!showAuthToken)}
                  className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-200"
                >
                  {showAuthToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {error && (
                <p className="mt-1 text-sm text-red-400">{error}</p>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
              <h3 className="text-blue-200 font-medium mb-2">What happens next?</h3>
              <ul className="text-blue-300/80 text-sm space-y-1">
                <li>• We'll validate your auth token with Convoso</li>
                <li>• Fetch your last 2,500 calls (takes 5-10 minutes)</li>
                <li>• Analyze call patterns, performance, and opportunities</li>
                <li>• Generate actionable insights and coaching recommendations</li>
              </ul>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold py-4 px-6 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Validating Credentials...
                </>
              ) : (
                <>
                  Start Discovery Analysis
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Help Section */}
          <div className="mt-8 pt-6 border-t border-gray-800">
            <p className="text-center text-gray-400 text-sm">
              Need help finding your auth token?{' '}
              <a
                href="https://help.convoso.com/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                View Convoso API docs
              </a>
              {' or '}
              <a
                href="mailto:support@syncedupsolutions.com"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                contact support
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DiscoverySetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    }>
      <DiscoverySetupContent />
    </Suspense>
  );
}