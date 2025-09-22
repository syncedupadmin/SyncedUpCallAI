'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  Download,
  Settings,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Phone,
  Clock,
  Users
} from 'lucide-react';

interface ConvosoImporterProps {
  suiteId: string;
  onImport?: () => void;
}

export default function ConvosoImporter({ suiteId, onImport }: ConvosoImporterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [importOptions, setImportOptions] = useState({
    days_back: 1,
    limit: 10,
    min_duration: 10,
    max_duration: 300,
    disposition_filter: 'all'
  });

  const checkConnection = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/testing/import-convoso-calls');
      const data = await res.json();
      setConnectionStatus(data);

      if (!data.connected) {
        toast.error('Convoso not connected. Check your API credentials.');
        console.log('Setup instructions:', data.setup_instructions);
      } else {
        toast.success(`Connected to Convoso: ${data.account || 'Account'}`);
      }
    } catch (error) {
      toast.error('Failed to check Convoso connection');
      setConnectionStatus({ connected: false, message: 'Connection check failed' });
    } finally {
      setChecking(false);
    }
  };

  const importCalls = async () => {
    setImporting(true);
    const toastId = toast.loading('Importing calls from Convoso...');

    try {
      // First check connection
      if (!connectionStatus || !connectionStatus.connected) {
        await checkConnection();
        if (!connectionStatus?.connected) {
          toast.error('Please connect to Convoso first', { id: toastId });
          return;
        }
      }

      const res = await fetch('/api/testing/import-convoso-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suite_id: suiteId,
          ...importOptions
        })
      });

      const data = await res.json();

      if (data.success) {
        toast.success(
          `Successfully imported ${data.imported} calls from Convoso!`,
          { id: toastId, duration: 5000 }
        );

        if (data.details?.imported?.length > 0) {
          console.log('Imported calls:', data.details.imported);
        }

        if (data.details?.failed?.length > 0) {
          console.warn('Failed imports:', data.details.failed);
        }

        onImport?.();
        setIsOpen(false);
      } else {
        toast.error(data.error || 'Import failed', { id: toastId });
      }
    } catch (error: any) {
      toast.error('Failed to import from Convoso', { id: toastId });
      console.error('Import error:', error);
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
          if (!connectionStatus) checkConnection();
        }}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm font-medium"
      >
        <Phone className="w-4 h-4" />
        Import from Convoso
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Phone className="w-5 h-5 text-indigo-600" />
            Import Calls from Convoso
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Connection Status */}
        <div className="px-6 py-4 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {connectionStatus?.connected ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-medium text-gray-900">Connected to Convoso</p>
                    <p className="text-sm text-gray-500">{connectionStatus.account}</p>
                  </div>
                </>
              ) : connectionStatus ? (
                <>
                  <XCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="font-medium text-gray-900">Not Connected</p>
                    <p className="text-sm text-gray-500">{connectionStatus.message}</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-gray-400" />
                  <p className="text-gray-500">Checking connection...</p>
                </>
              )}
            </div>
            <button
              onClick={checkConnection}
              disabled={checking}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              {checking ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                'Refresh'
              )}
            </button>
          </div>

          {connectionStatus && !connectionStatus.connected && connectionStatus.setup_instructions && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm font-medium text-yellow-800 mb-2">Setup Required:</p>
              <ol className="text-sm text-yellow-700 space-y-1">
                {connectionStatus.setup_instructions.map((instruction: string, i: number) => (
                  <li key={i}>{instruction}</li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Import Options */}
        <div className="px-6 py-4 space-y-4">
          <h3 className="font-medium text-gray-900 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Import Settings
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Days Back
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={importOptions.days_back}
                onChange={(e) => setImportOptions({
                  ...importOptions,
                  days_back: parseInt(e.target.value) || 1
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Number of Calls
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={importOptions.limit}
                onChange={(e) => setImportOptions({
                  ...importOptions,
                  limit: parseInt(e.target.value) || 10
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Duration (seconds)
              </label>
              <input
                type="number"
                min="3"
                max="3600"
                value={importOptions.min_duration}
                onChange={(e) => setImportOptions({
                  ...importOptions,
                  min_duration: parseInt(e.target.value) || 10
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Duration (seconds)
              </label>
              <input
                type="number"
                min="10"
                max="3600"
                value={importOptions.max_duration}
                onChange={(e) => setImportOptions({
                  ...importOptions,
                  max_duration: parseInt(e.target.value) || 300
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Disposition Filter
            </label>
            <select
              value={importOptions.disposition_filter}
              onChange={(e) => setImportOptions({
                ...importOptions,
                disposition_filter: e.target.value
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Dispositions</option>
              <option value="sales">Sales Only</option>
              <option value="callbacks">Callbacks</option>
              <option value="not_interested">Not Interested</option>
              <option value="connected">Connected Calls Only</option>
            </select>
          </div>
        </div>

        {/* Info Panel */}
        <div className="px-6 py-4 bg-blue-50 border-t border-blue-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">What happens when you import:</p>
              <ul className="space-y-1 ml-4 list-disc">
                <li>Fetches recent calls from Convoso with recordings</li>
                <li>Creates test cases for AI accuracy testing</li>
                <li>Automatically transcribes calls using your pipeline</li>
                <li>Allows you to test transcription accuracy</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t flex justify-between">
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>

          <div className="flex gap-2">
            {!connectionStatus?.connected && (
              <button
                onClick={checkConnection}
                disabled={checking}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
              >
                {checking ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Check Connection
              </button>
            )}

            <button
              onClick={importCalls}
              disabled={importing || !connectionStatus?.connected}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {importing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Import {importOptions.limit} Calls
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}