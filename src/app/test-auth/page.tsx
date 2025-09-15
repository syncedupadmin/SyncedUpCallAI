'use client';

import { useState } from 'react';
import { createClient } from '@/src/lib/supabase/client';

export default function TestAuthPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const testConnection = async () => {
    setLoading(true);
    try {
      // Test basic connection
      const { data, error } = await supabase.from('profiles').select('count').limit(1);

      if (error) {
        setResult({
          success: false,
          message: 'Database connection failed',
          error: error.message,
          details: error
        });
      } else {
        setResult({
          success: true,
          message: 'Database connection successful',
          data
        });
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: 'Connection error',
        error: err.message
      });
    }
    setLoading(false);
  };

  const testSignup = async () => {
    setLoading(true);
    try {
      const testEmail = `test${Date.now()}@example.com`;
      const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: 'TestPassword123!',
        options: {
          data: {
            name: 'Test User'
          }
        }
      });

      if (error) {
        setResult({
          success: false,
          message: 'Signup test failed',
          error: error.message,
          details: error,
          status: error.status
        });
      } else {
        setResult({
          success: true,
          message: 'Signup test successful',
          data,
          note: 'Check if email confirmation is required'
        });

        // Clean up - delete test user
        if (data.user) {
          await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
        }
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: 'Signup error',
        error: err.message
      });
    }
    setLoading(false);
  };

  const checkAuthSettings = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();

      setResult({
        session,
        user,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        message: 'Current auth state'
      });
    } catch (err: any) {
      setResult({
        success: false,
        message: 'Auth check error',
        error: err.message
      });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Supabase Authentication Test</h1>

        <div className="space-y-4 mb-8">
          <button
            onClick={testConnection}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 mr-4"
          >
            Test Database Connection
          </button>

          <button
            onClick={testSignup}
            disabled={loading}
            className="px-6 py-3 bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 mr-4"
          >
            Test Signup
          </button>

          <button
            onClick={checkAuthSettings}
            disabled={loading}
            className="px-6 py-3 bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            Check Auth Settings
          </button>
        </div>

        {loading && (
          <div className="text-yellow-400">Testing...</div>
        )}

        {result && (
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Result:</h2>
            <pre className="text-sm overflow-auto whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-8 p-6 bg-gray-800 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Configuration Status:</h2>
          <ul className="space-y-2">
            <li>
              Supabase URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ?
                <span className="text-green-400">✓ Configured</span> :
                <span className="text-red-400">✗ Missing</span>
              }
            </li>
            <li>
              Anon Key: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?
                <span className="text-green-400">✓ Configured</span> :
                <span className="text-red-400">✗ Missing</span>
              }
            </li>
          </ul>
        </div>

        <div className="mt-8 p-6 bg-yellow-900 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Next Steps:</h2>
          <ol className="list-decimal list-inside space-y-2">
            <li>Go to your Supabase Dashboard</li>
            <li>Check Authentication → Providers → Email is enabled</li>
            <li>Check Authentication → URL Configuration</li>
            <li>Run the SQL setup script in SQL Editor</li>
            <li>Try the signup test above</li>
          </ol>
        </div>
      </div>
    </div>
  );
}