'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Clock, CheckCircle, XCircle } from 'lucide-react';

export default function ConvosoSyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch last sync status
  const fetchSyncStatus = async () => {
    try {
      const response = await fetch('/api/admin/sync-status');
      const data = await response.json();
      setLastSync(data.lastSync);
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
    }
  };

  // Trigger manual sync
  const triggerSync = async () => {
    setSyncing(true);
    setSyncResult(null);

    try {
      const response = await fetch('/api/cron/convoso-sync');
      const data = await response.json();

      setSyncResult(data);

      if (data.success) {
        setLastSync(new Date().toISOString());
      }
    } catch (error: any) {
      setSyncResult({
        success: false,
        error: error.message
      });
    } finally {
      setSyncing(false);
    }
  };

  // Reset sync time for testing
  const resetSync = async (hoursAgo: number) => {
    if (!confirm(`Reset sync to ${hoursAgo} hour(s) ago?`)) return;

    try {
      const response = await fetch('/api/cron/convoso-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          office_id: 1,
          hours_ago: hoursAgo
        })
      });

      const data = await response.json();

      if (data.success) {
        alert(`Sync reset to: ${data.resetTo}`);
        fetchSyncStatus();
      }
    } catch (error: any) {
      alert(`Reset failed: ${error.message}`);
    }
  };

  useEffect(() => {
    fetchSyncStatus();

    // Auto-refresh status
    if (autoRefresh) {
      const interval = setInterval(fetchSyncStatus, 10000); // Every 10 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Convoso Sync Control</h1>

      {/* Status Card */}
      <div className="bg-gray-900 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Sync Status</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-400">Last Sync</p>
            <p className="text-white">
              {lastSync
                ? new Date(lastSync).toLocaleString()
                : 'Never'}
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-400">Auto Refresh</p>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="mr-2"
              />
              <span className="text-white">
                {autoRefresh ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gray-900 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Manual Controls</h2>

        <div className="flex gap-4 mb-4">
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => resetSync(1)}
            className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
          >
            Reset 1hr
          </button>
          <button
            onClick={() => resetSync(24)}
            className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
          >
            Reset 24hr
          </button>
          <button
            onClick={() => resetSync(168)}
            className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
          >
            Reset 1 week
          </button>
        </div>
      </div>

      {/* Sync Result */}
      {syncResult && (
        <div className={`rounded-lg p-6 ${
          syncResult.success ? 'bg-green-900' : 'bg-red-900'
        }`}>
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            {syncResult.success ? (
              <>
                <CheckCircle className="w-5 h-5" />
                Sync Successful
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5" />
                Sync Failed
              </>
            )}
          </h2>

          <pre className="text-sm overflow-auto">
            {JSON.stringify(syncResult, null, 2)}
          </pre>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4 mt-6">
        <h3 className="font-semibold mb-2">How It Works</h3>
        <ul className="text-sm space-y-1">
          <li>• Polls Convoso API every 5 minutes via cron</li>
          <li>• Fetches all calls since last check</li>
          <li>• Stores complete call data including recordings</li>
          <li>• Updates contacts automatically</li>
          <li>• No webhooks needed - direct API access</li>
        </ul>
      </div>
    </div>
  );
}