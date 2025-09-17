'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';

export default function TestCallsDetailPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchCallsDetail();
  }, []);

  const fetchCallsDetail = async () => {
    setLoading(true);

    try {
      // Get ALL calls to see what we have
      const { data: allCalls } = await supabase
        .from('calls')
        .select('id, agent_name, phone_number, started_at, disposition, duration_sec, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      setCalls(allCalls || []);

      // Get calls from today specifically
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: todayCalls } = await supabase
        .from('calls')
        .select('*')
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });

      setRecentCalls(todayCalls || []);

    } catch (error: any) {
      console.error('Error:', error);
    }

    setLoading(false);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Detailed Call Analysis</h1>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* Today's Calls */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Calls Created Today</h2>
            <div className="text-sm">
              <div>Count: <span className="text-green-400">{recentCalls.length}</span></div>
              {recentCalls.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="px-2 py-1 text-left">Agent</th>
                        <th className="px-2 py-1 text-left">Phone</th>
                        <th className="px-2 py-1 text-left">Disposition</th>
                        <th className="px-2 py-1 text-left">Created At</th>
                        <th className="px-2 py-1 text-left">Started At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentCalls.slice(0, 5).map((call, i) => (
                        <tr key={i} className="border-t border-gray-700">
                          <td className="px-2 py-1">{call.agent_name || 'Unknown'}</td>
                          <td className="px-2 py-1">{call.phone_number || 'N/A'}</td>
                          <td className="px-2 py-1">{call.disposition || 'N/A'}</td>
                          <td className="px-2 py-1">{new Date(call.created_at).toLocaleString()}</td>
                          <td className="px-2 py-1">{call.started_at ? new Date(call.started_at).toLocaleString() : 'Invalid'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* All Calls (Recent 20) */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Recent 20 Calls (by created_at)</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="px-2 py-1 text-left">ID (first 8 chars)</th>
                    <th className="px-2 py-1 text-left">Agent</th>
                    <th className="px-2 py-1 text-left">Phone</th>
                    <th className="px-2 py-1 text-left">Disp</th>
                    <th className="px-2 py-1 text-left">Duration</th>
                    <th className="px-2 py-1 text-left">Created</th>
                    <th className="px-2 py-1 text-left">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((call, i) => (
                    <tr key={i} className="border-t border-gray-700">
                      <td className="px-2 py-1 font-mono text-xs">{call.id?.substring(0, 8)}</td>
                      <td className="px-2 py-1">{call.agent_name || 'Unknown'}</td>
                      <td className="px-2 py-1">{call.phone_number || 'N/A'}</td>
                      <td className="px-2 py-1">{call.disposition || 'N/A'}</td>
                      <td className="px-2 py-1">{call.duration_sec || 0}s</td>
                      <td className="px-2 py-1">{new Date(call.created_at).toLocaleDateString()}</td>
                      <td className="px-2 py-1 text-red-400">
                        {call.started_at && new Date(call.started_at).getFullYear() > 1970
                          ? new Date(call.started_at).toLocaleDateString()
                          : 'Invalid'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Raw API Test */}
          <div className="bg-gray-800 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">API Endpoints</h2>
            <div className="space-y-2">
              <button
                onClick={async () => {
                  const res = await fetch('/api/admin/calls-simple');
                  const data = await res.json();
                  console.log('calls-simple:', data);
                  alert(`calls-simple returned ${data.data?.length || 0} calls. Check console for details.`);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
              >
                Test /api/admin/calls-simple
              </button>
            </div>
          </div>

          <button
            onClick={fetchCallsDetail}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
          >
            Refresh Data
          </button>
        </div>
      )}
    </div>
  );
}