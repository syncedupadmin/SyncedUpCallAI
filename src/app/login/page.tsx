'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      });

      if (error) throw error;

      if (data?.user) {
        // Check user's access level using the database function
        console.log('Checking access level for user:', data.user.email);
        const { data: userLevel, error: levelError } = await supabase.rpc('get_user_level');
        console.log('User level result:', { userLevel, levelError });

        if (levelError) {
          console.error('Error checking user level:', levelError);
          // Default to regular user if check fails
          toast.success('Welcome back!');
          router.push('/dashboard');
          return;
        }

        // Route based on user level
        switch(userLevel) {
          case 'super_admin':
            // Super admin user - set the admin cookie and route to super admin portal
            console.log('User is super admin, setting cookie...');
            const superAdminCookieRes = await fetch('/api/auth/admin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: formData.email,
                password: formData.password
              })
            });

            const superAdminCookieData = await superAdminCookieRes.json();
            console.log('Cookie response:', superAdminCookieData);

            if (superAdminCookieRes.ok && superAdminCookieData.ok) {
              toast.success('Welcome back, Super Admin!');
              router.push('/admin/super');
            } else {
              console.error('Failed to set admin cookie:', superAdminCookieData);
              toast.error('Admin authentication failed');
              router.push('/dashboard');
            }
            break;

          case 'admin':
            // Regular admin (operator) - set cookie and route to operator console
            console.log('User is operator admin, setting cookie...');
            const adminCookieRes = await fetch('/api/auth/admin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: formData.email,
                password: formData.password
              })
            });

            const adminCookieData = await adminCookieRes.json();
            console.log('Cookie response:', adminCookieData);

            if (adminCookieRes.ok && adminCookieData.ok) {
              toast.success('Welcome back, Operator!');
              router.push('/admin');
            } else {
              console.error('Failed to set admin cookie:', adminCookieData);
              toast.error('Admin authentication failed');
              router.push('/dashboard');
            }
            break;

          case 'user':
          default:
            // Regular user - route to dashboard
            toast.success('Welcome back!');
            router.push('/dashboard');
            break;
        }
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
      toast.error(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      toast.error('Please enter your email address');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast.success('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

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
              href="/"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Home</span>
            </Link>

            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Welcome Back
              </h1>
              <p className="text-gray-400 mt-2">Sign in to your account</p>
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
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    id="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                    placeholder="Enter your password"
                    minLength={6}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 bg-gray-800 border-gray-700 rounded focus:ring-cyan-500 focus:ring-2"
                  />
                  <span className="ml-2 text-sm text-gray-400">Remember me</span>
                </label>

                <Link
                  href="/forgot-password"
                  className="text-sm text-cyan-400 hover:text-cyan-300 transition"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-800">
              <p className="text-center text-sm text-gray-400">
                Don't have an account?{' '}
                <Link href="/signup" className="text-cyan-400 hover:text-cyan-300 transition">
                  Create one
                </Link>
              </p>
            </div>

          </div>
        </div>
      </motion.div>
    </div>
  );
}