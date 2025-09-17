'use client';

import { useState, useEffect } from 'react';

export default function CallsTestPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Test the API directly
      const response = await fetch('/api/admin/calls-simple');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);

      console.log('Fetched data:', result);

    } catch (err: any) {
      setError(err.message);
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Calls Test Page</h1>

      <div className="bg-gray-800 p-4 rounded mb-4">
        <h2 className="text-lg font-semibold mb-2">API Response</h2>
        <div className="text-sm">
          <div>Status: {data?.ok ? '✅ OK' : '❌ Failed'}</div>
          <div>Count: {data?.data?.length || 0} calls returned</div>
          <div>Actual Count: {data?.count || 'N/A'}</div>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded mb-4">
        <h2 className="text-lg font-semibold mb-2">First 5 Calls</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="px-2 py-1 text-left">ID</th>
                <th className="px-2 py-1 text-left">Agent</th>
                <th className="px-2 py-1 text-left">Phone</th>
                <th className="px-2 py-1 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {data?.data?.slice(0, 5).map((call: any, i: number) => (
                <tr key={i} className="border-t border-gray-700">
                  <td className="px-2 py-1 font-mono text-xs">{call.id?.substring(0, 8)}...</td>
                  <td className="px-2 py-1">{call.agent_name || 'Unknown'}</td>
                  <td className="px-2 py-1">{call.phone_number || 'N/A'}</td>
                  <td className="px-2 py-1">{new Date(call.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        onClick={fetchData}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
      >
        Refresh
      </button>

      <div className="mt-4 text-xs text-gray-500">
        <div>Check browser console for detailed logs</div>
        <div>Raw response below:</div>
      </div>

      <pre className="mt-2 p-4 bg-gray-900 rounded text-xs overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}