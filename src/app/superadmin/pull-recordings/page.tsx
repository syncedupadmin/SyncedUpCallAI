'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Human dispositions we want to process
const HUMAN_DISPOSITIONS = [
  { code: 'NOTA', label: 'Not Available', selected: true },
  { code: 'HU', label: 'Hang Up', selected: true },
  { code: 'A', label: 'Answering Machine', selected: true },
  { code: 'N', label: 'No Answer', selected: true },
  { code: 'INST', label: 'Interested', selected: true },
  { code: 'WRONG', label: 'Wrong Number', selected: true },
  { code: 'NI', label: 'Not Interested', selected: true },
  { code: 'SALE', label: 'Sale', selected: true },
  { code: 'CNA', label: 'Medicaid/CNA', selected: true },
  { code: 'AP', label: 'Already Purchased', selected: true },
  { code: 'FI', label: 'Front', selected: true },
  { code: 'MEDI', label: 'Medicaid', selected: true },
  { code: 'LT', label: 'Pre-Qualified Transfer', selected: true },
  { code: 'NQ', label: 'xMGMT DNCx', selected: true },
  { code: 'PD', label: 'Post Date!', selected: true },
  { code: 'CARE', label: 'Medicare Xfer', selected: true },
  { code: 'DONC', label: 'DO NOT CALL!', selected: true },
  { code: 'NOCON', label: 'No Contact', selected: true },
  { code: 'NOTQUD', label: 'Not Qualified/Pre-Ex', selected: true },
  { code: 'ACAXFR', label: 'ACA Live Transfer', selected: true },
  { code: 'VERCOM', label: 'Verification - Complete', selected: true },
  { code: 'VERINC', label: 'Verification - Incomplete', selected: true },
  { code: 'VERDEC', label: 'Verification - Incomplete Payment Declin', selected: true },
  { code: 'ACAELI', label: 'ACA Eligible', selected: true },
  { code: 'ACATHA', label: 'ACA Lead', selected: true },
  { code: 'ACAWAP', label: 'ACA Wrap', selected: true }
];

// System dispositions we typically skip
const SYSTEM_DISPOSITIONS = [
  { code: 'AA', label: 'Answering Machine Detected', selected: false },
  { code: 'AFAX', label: 'CPD Fax', selected: false },
  { code: 'AH', label: 'Answered & Hung-up', selected: false },
  { code: 'AHXFER', label: 'Queue After Hours Action Trigger', selected: false },
  { code: 'AM', label: 'Answering Machine Detected Message Left', selected: false },
  { code: 'ANONY', label: 'Anonymous Call', selected: false },
  { code: 'B', label: 'System Busy', selected: false },
  { code: 'BCHU', label: 'Broadcast Call Hung Up', selected: false },
  { code: 'BLEND', label: 'Blended Call', selected: false },
  { code: 'CALLHU', label: 'Caller Hung Up', selected: false },
  { code: 'CG', label: 'Congestion', selected: false },
  { code: 'CGD', label: 'Congestion Account Disconnected', selected: false },
  { code: 'CGO', label: 'Congestion Out of Minutes', selected: false },
  { code: 'CGT', label: 'Congested Temporarily', selected: false },
  { code: 'CIDB', label: 'Blocked Caller ID', selected: false },
  { code: 'CIDROP', label: 'Create New Lead & Drop Call', selected: false },
  { code: 'CSED', label: 'Call Scenario Ended', selected: false },
  { code: 'CSI', label: 'Call Scenario Incomplete', selected: false },
  { code: 'DC', label: 'Disconnected Number', selected: false },
  { code: 'DELETE', label: 'Lead was moved to recycle bin', selected: false }
];

interface RecordingStats {
  total: number;
  byAgent: Record<string, number>;
  byDisposition: Record<string, number>;
  byDuration: {
    under30s: number;
    under1min: number;
    under2min: number;
    over2min: number;
  };
}

interface PullProgress {
  status: 'idle' | 'fetching' | 'processing' | 'complete' | 'error';
  message: string;
  current: number;
  total: number;
  stats?: RecordingStats;
}

export default function PullRecordingsPage() {
  const router = useRouter();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDispositions, setSelectedDispositions] = useState(
    [...HUMAN_DISPOSITIONS, ...SYSTEM_DISPOSITIONS]
  );
  const [dryRun, setDryRun] = useState(true);
  const [progress, setProgress] = useState<PullProgress>({
    status: 'idle',
    message: '',
    current: 0,
    total: 0
  });

  const handleDispositionToggle = (code: string) => {
    setSelectedDispositions(prev =>
      prev.map(d => d.code === code ? { ...d, selected: !d.selected } : d)
    );
  };

  const selectAllHuman = () => {
    setSelectedDispositions(prev =>
      prev.map(d => {
        const isHuman = HUMAN_DISPOSITIONS.some(h => h.code === d.code);
        return { ...d, selected: isHuman };
      })
    );
  };

  const selectAllSystem = () => {
    setSelectedDispositions(prev =>
      prev.map(d => {
        const isSystem = SYSTEM_DISPOSITIONS.some(s => s.code === d.code);
        return { ...d, selected: isSystem };
      })
    );
  };

  const selectAll = () => {
    setSelectedDispositions(prev => prev.map(d => ({ ...d, selected: true })));
  };

  const deselectAll = () => {
    setSelectedDispositions(prev => prev.map(d => ({ ...d, selected: false })));
  };

  const handlePullRecordings = async () => {
    const selected = selectedDispositions.filter(d => d.selected).map(d => d.code);

    if (!startDate || !endDate) {
      alert('Please select both start and end dates');
      return;
    }

    if (selected.length === 0) {
      alert('Please select at least one disposition');
      return;
    }

    setProgress({
      status: 'fetching',
      message: 'Connecting to Convoso API...',
      current: 0,
      total: 0
    });

    try {
      const response = await fetch('/api/admin/bulk-import-recordings-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate,
          dispositions: selected,
          dry_run: dryRun
        })
      });

      if (!response.ok) {
        throw new Error(`Failed: ${response.statusText}`);
      }

      // Handle streaming response for progress updates
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n').filter(line => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.progress) {
                  setProgress(data.progress);
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e);
              }
            }
          }
        }
      }

      setProgress(prev => ({
        ...prev,
        status: 'complete',
        message: 'Recording pull completed successfully!'
      }));

    } catch (error: any) {
      setProgress({
        status: 'error',
        message: error.message || 'Failed to pull recordings',
        current: 0,
        total: 0
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/admin')}
                className="mr-4 rounded-lg p-2 hover:bg-gray-100"
              >
                ←
              </button>
              <h1 className="text-2xl font-semibold text-gray-900">Pull Historical Recordings</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* Date Range Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-4 text-gray-900">Date Range</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Disposition Selection */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-gray-900">Dispositions to Include</h2>
              <div className="space-x-2">
                <button
                  onClick={selectAllHuman}
                  className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                >
                  Human Only
                </button>
                <button
                  onClick={selectAllSystem}
                  className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                >
                  System Only
                </button>
                <button
                  onClick={selectAll}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAll}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Human Dispositions */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Human Dispositions</h3>
                <div className="grid grid-cols-3 gap-2">
                  {HUMAN_DISPOSITIONS.map(dispo => {
                    const selected = selectedDispositions.find(d => d.code === dispo.code)?.selected;
                    return (
                      <label key={dispo.code} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected || false}
                          onChange={() => handleDispositionToggle(dispo.code)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className={selected ? 'text-gray-900' : 'text-gray-500'}>
                          {dispo.code} - {dispo.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* System Dispositions */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">System Dispositions</h3>
                <div className="grid grid-cols-3 gap-2">
                  {SYSTEM_DISPOSITIONS.map(dispo => {
                    const selected = selectedDispositions.find(d => d.code === dispo.code)?.selected;
                    return (
                      <label key={dispo.code} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected || false}
                          onChange={() => handleDispositionToggle(dispo.code)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className={selected ? 'text-gray-900' : 'text-gray-500'}>
                          {dispo.code} - {dispo.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Options and Action */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium">
                    Dry Run (preview without saving)
                  </span>
                </label>
              </div>
              <button
                onClick={handlePullRecordings}
                disabled={progress.status !== 'idle' && progress.status !== 'complete' && progress.status !== 'error'}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
              >
                <span>↓ Pull Recordings</span>
              </button>
            </div>
          </div>

          {/* Progress Display */}
          {progress.status !== 'idle' && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="space-y-4">
                {/* Status Header */}
                <div className="flex items-center space-x-3">
                  {progress.status === 'complete' && (
                    <span className="text-2xl">✅</span>
                  )}
                  {progress.status === 'error' && (
                    <span className="text-2xl">❌</span>
                  )}
                  {(progress.status === 'fetching' || progress.status === 'processing') && (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                  )}
                  <div>
                    <div className="font-medium">
                      {progress.status === 'fetching' && 'Fetching recordings...'}
                      {progress.status === 'processing' && 'Processing recordings...'}
                      {progress.status === 'complete' && 'Pull completed!'}
                      {progress.status === 'error' && 'Error occurred'}
                    </div>
                    <div className="text-sm text-gray-600">{progress.message}</div>
                  </div>
                </div>

                {/* Progress Bar */}
                {progress.total > 0 && (
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>{progress.current} of {progress.total} recordings</span>
                      <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Statistics */}
                {progress.stats && (
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    {/* By Agent */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">By Agent</h4>
                      <div className="space-y-1 text-sm">
                        {Object.entries(progress.stats.byAgent)
                          .sort(([,a], [,b]) => b - a)
                          .slice(0, 5)
                          .map(([agent, count]) => (
                            <div key={agent} className="flex justify-between">
                              <span className="text-gray-600">{agent}</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* By Disposition */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">By Disposition</h4>
                      <div className="space-y-1 text-sm">
                        {Object.entries(progress.stats.byDisposition)
                          .sort(([,a], [,b]) => b - a)
                          .slice(0, 5)
                          .map(([dispo, count]) => (
                            <div key={dispo} className="flex justify-between">
                              <span className="text-gray-600">{dispo}</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* By Duration */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">By Duration</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">&lt; 30s</span>
                          <span className="font-medium">{progress.stats.byDuration.under30s}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">30s - 1m</span>
                          <span className="font-medium">{progress.stats.byDuration.under1min}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">1m - 2m</span>
                          <span className="font-medium">{progress.stats.byDuration.under2min}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">&gt; 2m</span>
                          <span className="font-medium">{progress.stats.byDuration.over2min}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}