'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, AlertCircle, Loader2, ArrowLeft, CheckCircle, KeyRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [stage, setStage] = useState<'verifying' | 'ready' | 'updating' | 'done' | 'error'>('verifying');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    const verifyTokens = async () => {
      try {
        // First, try query-param flow (?code=...)
        const code = searchParams.get('code');
        if (code) {
          console.log('Attempting to exchange code for session:', code);
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('Code exchange failed:', error);
            throw error;
          }
          console.log('Code exchange successful');
          setStage('ready');
          return;
        }

        // Second, try hash flow (#access_token=...&refresh_token=...&type=recovery)
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        if (hash?.includes('access_token=')) {
          console.log('Attempting to set session from hash params');
          const params = new URLSearchParams(hash.replace(/^#/, ''));
          const accessToken = params.get('access_token') || '';
          const refreshToken = params.get('refresh_token') || '';
          const type = params.get('type');

          if (type === 'recovery' && accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            if (error) {
              console.error('Session set failed:', error);
              throw error;
            }
            // Clean up the URL hash
            window.history.replaceState({}, '', window.location.pathname);
            console.log('Session set successful');
            setStage('ready');
            return;
          }
        }

        // Check if user is already logged in (they can change password)
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log('User already authenticated');
          setStage('ready');
          return;
        }

        // No valid tokens found
        setStage('error');
        setError('Invalid or missing recovery token. Please request a new password reset email.');
      } catch (e: any) {
        console.error('Token verification error:', e);
        setStage('error');
        setError(e?.message || 'Failed to verify recovery token. Please request a new reset link.');
      }
    };

    verifyTokens();
  }, [searchParams, supabase]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validation
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.');
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      toast.error('Passwords do not match');
      return;
    }

    setStage('updating');
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error('Password update failed:', error);
        setStage('ready');
        setError(error.message);
        toast.error(error.message);
        return;
      }

      setStage('done');
      toast.success('Password updated successfully!');
      setTimeout(() => router.replace('/login?reset=1'), 1500);
    } catch (e: any) {
      setStage('ready');
      setError(e?.message || 'Failed to update password.');
      toast.error(e?.message || 'Failed to update password');
    }
  };

  // Loading state
  if (stage === 'verifying') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Verifying reset link...</p>
        </motion.div>
      </div>
    );
  }

  // Error state
  if (stage === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Invalid Reset Link</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition"
          >
            <KeyRound className="w-4 h-4" />
            Request New Reset Link
          </Link>
          <div className="mt-4">
            <Link href="/login" className="text-cyan-400 hover:text-cyan-300 transition text-sm">
              Back to Login
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // Success state
  if (stage === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Password Updated!</h2>
          <p className="text-gray-400">Redirecting to login...</p>
        </motion.div>
      </div>
    );
  }

  // Ready state - show password reset form
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-2xl blur-3xl opacity-20" />

        <div className="relative bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-800 overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-purple-600" />

          <div className="p-8">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Login</span>
            </Link>

            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Set New Password
              </h1>
              <p className="text-gray-400 mt-2">Enter your new password below</p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-400">{error}</span>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                    placeholder="Re-enter new password"
                    minLength={8}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={stage === 'updating'}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {stage === 'updating' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Updating password...
                  </>
                ) : (
                  'Set New Password'
                )}
              </button>
            </form>

            <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-xs text-blue-400 text-center">
                Make sure to use a strong password that you haven't used before.
                Your password should be at least 8 characters long.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}