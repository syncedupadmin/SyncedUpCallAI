'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, AlertCircle, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!email) {
      setError('Please enter your email address');
      setIsLoading(false);
      return;
    }

    try {
      console.log('Attempting password reset for:', email);
      console.log('Redirect URL:', `${window.location.origin}/reset-password`);

      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });

      console.log('Supabase response:', { data, error });

      if (error) {
        console.error('Supabase error details:', {
          message: error.message,
          status: error.status,
          name: error.name,
          fullError: error
        });
        throw error;
      }

      console.log('Password reset email sent successfully');
      setIsSuccess(true);
      toast.success('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      console.error('Caught error:', err);
      setError(err.message || 'Failed to send reset email');
      toast.error(err.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
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
          <h2 className="text-2xl font-bold text-white mb-4">Check Your Email!</h2>
          <p className="text-gray-400 mb-2">
            We've sent a password reset link to:
          </p>
          <p className="text-white font-medium mb-6">{email}</p>
          <p className="text-sm text-gray-500 mb-8">
            Click the link in the email to reset your password. The link will expire in 1 hour.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>
        </motion.div>
      </div>
    );
  }

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
                Forgot Password?
              </h1>
              <p className="text-gray-400 mt-2">
                Enter your email and we'll send you a reset link
              </p>
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
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                    placeholder="you@example.com"
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Sending reset link...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>

            <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-xs text-blue-400 text-center">
                The reset link will be valid for 1 hour. If you don't receive the email, check your spam folder.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}