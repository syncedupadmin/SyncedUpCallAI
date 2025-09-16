'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';

export default function TestCallsPage() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [userLevel, setUserLevel] = useState<string | null>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    runTests();
  }, []);

  const runTests = async () => {
    const errorList: string[] = [];
    setLoading(true);

    try {
      // Test 1: Check authentication
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        errorList.push(`Auth error: ${authError.message}`);
      } else if (!authUser) {
        errorList.push('No authenticated user found');
      } else {
        setUser(authUser);
      }

      // Test 2: Check is_admin function
      const { data: adminStatus, error: adminError } = await supabase.rpc('is_admin');
      if (adminError) {
        errorList.push(`is_admin error: ${adminError.message}`);
      } else {
        setIsAdmin(adminStatus);
      }

      // Test 3: Check user level
      const { data: level, error: levelError } = await supabase.rpc('get_user_level');
      if (levelError) {
        errorList.push(`get_user_level error: ${levelError.message}`);
      } else {
        setUserLevel(level);
      }

      // Test 4: Try to fetch calls directly from Supabase
      const { data: callsData, error: callsError } = await supabase
        .from('calls')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      if (callsError) {
        errorList.push(`Direct calls fetch error: ${callsError.message}`);
      } else {
        setCalls(callsData || []);
      }

      // Test 5: Try API endpoints
      try {
        const response1 = await fetch('/api/admin/calls-simple');
        const data1 = await response1.json();
        if (!data1.ok) {
          errorList.push(`calls-simple API error: ${data1.error}`);
        }
      } catch (e: any) {
        errorList.push(`calls-simple fetch error: ${e.message}`);
      }

      try {
        const response2 = await fetch('/api/admin/calls');
        const data2 = await response2.json();
        if (!data2.ok) {
          errorList.push(`calls API error: ${data2.error}`);
        }
      } catch (e: any) {
        errorList.push(`calls fetch error: ${e.message}`);
      }

      // Test 6: Try debug endpoint
      try {
        const response3 = await fetch('/api/debug/calls');
        const data3 = await response3.json();
        if (!data3.ok) {
          errorList.push(`debug API error: ${data3.error}`);
        }
      } catch (e: any) {
        errorList.push(`debug fetch error: ${e.message}`);
      }

    } catch (error: any) {
      errorList.push(`General error: ${error.message}`);
    }

    setErrors(errorList);
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Calls System Test</h1>

      {loading ? (
        <div>Running tests...</div>
      ) : (
        <div className="space-y-6">
          {/* User Info */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Authentication Status</h2>
            <div className="space-y-1 text-sm">
              <div>User Email: <span className="text-green-400">{user?.email || 'Not logged in'}</span></div>
              <div>User ID: <span className="text-gray-400">{user?.id || 'N/A'}</span></div>
              <div>Is Admin: <span className={isAdmin ? 'text-green-400' : 'text-red-400'}>{String(isAdmin)}</span></div>
              <div>User Level: <span className="text-blue-400">{userLevel || 'N/A'}</span></div>
            </div>
          </div>

          {/* Direct Database Calls */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Direct Database Access</h2>
            <div className="text-sm">
              <div>Calls fetched directly: <span className="text-green-400">{calls.length}</span></div>
              {calls.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-gray-400">Recent calls:</div>
                  <ul className="mt-1 space-y-1">
                    {calls.slice(0, 3).map((call, i) => (
                      <li key={i} className="text-xs">
                        {call.agent_name || 'Unknown'} - {call.disposition || 'N/A'} - {new Date(call.started_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-900/50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-2 text-red-400">Errors Found</h2>
              <ul className="space-y-1 text-sm text-red-300">
                {errors.map((error, i) => (
                  <li key={i}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Success */}
          {errors.length === 0 && (
            <div className="bg-green-900/50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-2 text-green-400">All Tests Passed!</h2>
              <p className="text-sm text-green-300">System is working correctly.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={runTests}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
            >
              Re-run Tests
            </button>
            <button
              onClick={() => window.location.href = '/admin/calls'}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
            >
              Go to Calls Page
            </button>
          </div>
        </div>
      )}
    </div>
  );
}