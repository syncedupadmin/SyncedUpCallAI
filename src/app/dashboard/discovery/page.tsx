'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyIcon, Server, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DiscoverySetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showSkipOption, setShowSkipOption] = useState(false);
  const [credentials, setCredentials] = useState({
    api_key: '',
    auth_token: '',
    api_base: 'https://api.convoso.com/v1'
  });

  const MAX_RETRIES = 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/discovery/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          convoso_api_key: credentials.api_key,
          convoso_auth_token: credentials.auth_token,
          convoso_api_base: credentials.api_base
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start discovery');
      }

      // Check if discovery was skipped due to insufficient data
      if (data.skipped) {
        toast.error(data.reason);
        // Redirect to dashboard after a delay
        setTimeout(() => {
          router.push(data.redirectTo || '/dashboard');
        }, 3000);
        return;
      }

      // Success - redirect to results page
      toast.success(`Discovery started! Analyzing ${data.callCount} calls...`);
      router.push(`/dashboard/discovery/results?session=${data.sessionId}`);

    } catch (error: any) {
      console.error('[Discovery Setup] Error:', error);

      // Retry logic
      if (retryCount < MAX_RETRIES) {
        setRetryCount(prev => prev + 1);
        toast.error(`Failed. Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
        setLoading(false);

        // Retry after 2 seconds
        setTimeout(() => {
          handleSubmit(e);
        }, 2000);
      } else {
        toast.error('Failed after 3 attempts. You can skip discovery or contact support.');
        setShowSkipOption(true);
        setLoading(false);
      }
    }
  };

  const handleSkip = async () => {
    try {
      setLoading(true);
      await fetch('/api/discovery/skip', { method: 'POST' });
      toast.success('Discovery skipped. You can run it later from settings.');
      router.push('/dashboard');
    } catch (error) {
      toast.error('Failed to skip discovery');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Welcome to SyncedUp Call AI</h1>
          <p className="text-gray-400 text-lg">
            Let's analyze your existing calls to create your performance baseline
          </p>
        </div>

        <div className="bg-gray-900 rounded-xl p-8 border border-gray-800">
          <div className="flex items-center gap-3 mb-6">
            <Server className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold">Connect to Convoso</h2>
          </div>

          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-100">
                <p className="font-medium mb-1">What we'll do:</p>
                <ul className="space-y-1 text-blue-200">
                  <li>• Pull your last 2,500 calls from Convoso (takes 5-10 minutes)</li>
                  <li>• Analyze performance patterns and agent behaviors</li>
                  <li>• Create personalized coaching insights</li>
                  <li>• Your credentials are encrypted and secure</li>
                </ul>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Convoso API Key
              </label>
              <input
                type="text"
                value={credentials.api_key}
                onChange={(e) => setCredentials({ ...credentials, api_key: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                placeholder="your-api-key-here"
                required
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">
                Find this in your Convoso admin panel under API settings
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Convoso Auth Token
              </label>
              <input
                type="password"
                value={credentials.auth_token}
                onChange={(e) => setCredentials({ ...credentials, auth_token: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                placeholder="your-auth-token-here"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                API Base URL (optional)
              </label>
              <input
                type="text"
                value={credentials.api_base}
                onChange={(e) => setCredentials({ ...credentials, api_base: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                placeholder="https://api.convoso.com/v1"
                disabled={loading}
              />
            </div>

            {retryCount > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3">
                <p className="text-sm text-yellow-200">
                  Retry attempt {retryCount} of {MAX_RETRIES}...
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Starting Discovery...
                </>
              ) : (
                <>
                  <KeyIcon className="w-5 h-5" />
                  Start Discovery Analysis
                </>
              )}
            </button>

            {showSkipOption && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={loading}
                className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-3 px-6 rounded-lg transition-colors"
              >
                Skip Discovery and Continue to Dashboard
              </button>
            )}
          </form>
        </div>

        <div className="mt-6 text-center space-y-2">
          <p className="text-sm text-gray-500">
            Your credentials are encrypted using AES-256-GCM and used only to pull call data.
          </p>
          <a
            href="https://help.convoso.com/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
          >
            Need help finding your Convoso credentials?
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}