'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { RefreshCw, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

interface WebhookLog {
  id: string;
  created_at: string;
  url?: string;
  fields: string[];
  body: any;
}

interface WebhookStats {
  total_webhooks: number;
  with_phone: number;
  with_agent: number;
  with_campaign: number;
  sources: { source: string; count: number }[];
}

export default function WebhookDebugPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch debug logs
      const debugResponse = await fetch('/api/webhooks/debug');
      const debugData = await debugResponse.json();
      if (debugData.ok) {
        setLogs(debugData.recent_webhooks || []);
      }

      // Fetch stats
      const statsResponse = await fetch('/api/admin/webhook-logs');
      const statsData = await statsResponse.json();

      // Calculate stats from the response
      if (statsData.ok && statsData.data) {
        const webhooks = statsData.data;
        const stats: WebhookStats = {
          total_webhooks: webhooks.length,
          with_phone: webhooks.filter((w: any) => w.data?.phone).length,
          with_agent: webhooks.filter((w: any) => w.data?.agent).length,
          with_campaign: webhooks.filter((w: any) => w.data?.campaign).length,
          sources: []
        };
        setStats(stats);
      }
    } catch (error) {
      console.error('Error fetching webhook debug data:', error);
    } finally {
      setLoading(false);
    }
  };

  const testWebhook = async () => {
    try {
      const testPayload = {
        lead_id: 'TEST-' + Date.now(),
        agent_name: 'Debug Test Agent',
        phone_number: '555-TEST-' + Math.floor(Math.random() * 10000),
        campaign: 'Debug Test Campaign',
        disposition: 'TEST',
        duration: 60
      };

      const response = await fetch('/api/webhooks/convoso', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testPayload)
      });

      const result = await response.json();
      alert(`Test webhook sent! Response: ${JSON.stringify(result)}`);

      // Refresh data after test
      setTimeout(fetchData, 1000);
    } catch (error) {
      alert(`Error sending test webhook: ${error}`);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-400">Loading webhook debug data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent mb-2">
          Webhook Debug Dashboard
        </h1>
        <p className="text-gray-400">Monitor and debug incoming webhooks</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Webhooks</div>
          <div className="text-2xl font-bold text-white">{stats?.total_webhooks || 0}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">With Phone</div>
          <div className="text-2xl font-bold text-green-400">{stats?.with_phone || 0}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">With Agent</div>
          <div className="text-2xl font-bold text-blue-400">{stats?.with_agent || 0}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">With Campaign</div>
          <div className="text-2xl font-bold text-purple-400">{stats?.with_campaign || 0}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 rounded-lg text-gray-300 hover:text-white transition flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
        <button
          onClick={testWebhook}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-white transition"
        >
          Send Test Webhook
        </button>
      </div>

      {/* Recent Webhooks */}
      <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Recent Webhook Logs</h2>
        </div>
        <div className="divide-y divide-gray-800">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No webhook logs found. Send a test webhook to see debug data.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-4 hover:bg-gray-800/30 transition cursor-pointer"
                onClick={() => setSelectedLog(log)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm text-gray-400 mb-1">
                      {log.created_at ? format(new Date(log.created_at), 'MMM dd, HH:mm:ss') : 'Unknown time'}
                    </div>
                    <div className="text-xs text-gray-500">
                      Fields: {log.fields.join(', ') || 'No fields'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {log.body?.phone_number || log.body?.customer_phone ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    {log.body?.agent_name || log.body?.user ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Selected Log Details */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-white">Webhook Details</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <pre className="bg-gray-800 rounded p-4 text-xs text-gray-300 overflow-x-auto">
              {JSON.stringify(selectedLog.body, null, 2)}
            </pre>
            <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded">
              <h4 className="text-sm font-semibold text-orange-400 mb-2">Extracted Data:</h4>
              <div className="text-xs text-gray-400 space-y-1">
                <div>Phone: {selectedLog.body?.phone_number || selectedLog.body?.customer_phone || 'NOT FOUND'}</div>
                <div>Agent: {selectedLog.body?.agent_name || selectedLog.body?.user || 'NOT FOUND'}</div>
                <div>Campaign: {selectedLog.body?.campaign || 'NOT FOUND'}</div>
                <div>Disposition: {selectedLog.body?.disposition || 'NOT FOUND'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Box */}
      <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-400 mb-1">Debugging Tips</h4>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>• The debug endpoint at /api/webhooks/debug logs all incoming webhooks</li>
              <li>• Check if phone/agent fields are in the webhook payload</li>
              <li>• Verify Convoso is sending to /api/webhooks/convoso endpoint</li>
              <li>• Look for fields like phone_number, customer_phone, lead_phone, etc.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}