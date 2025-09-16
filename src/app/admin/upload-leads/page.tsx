'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface UploadStats {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  recordings_found: number;
}

interface ProgressUpdate {
  status: 'idle' | 'parsing' | 'processing' | 'complete' | 'error';
  message: string;
  current: number;
  total: number;
  stats?: UploadStats;
  current_lead?: string;
}

export default function UploadLeadsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [leadIds, setLeadIds] = useState<string[]>([]);
  const [previewLeads, setPreviewLeads] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressUpdate>({
    status: 'idle',
    message: '',
    current: 0,
    total: 0
  });
  const [batchSize, setBatchSize] = useState(50);
  const [delayMs, setDelayMs] = useState(100);
  const [dryRun, setDryRun] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);

    // Parse file to extract lead IDs
    const text = await selectedFile.text();
    const ids = parseLeadIds(text);

    setLeadIds(ids);
    setPreviewLeads(ids.slice(0, 10));

    setProgress({
      status: 'idle',
      message: `Found ${ids.length} lead IDs`,
      current: 0,
      total: ids.length
    });
  };

  const parseLeadIds = (text: string): string[] => {
    // Split by common delimiters and clean up
    const lines = text.split(/[\n\r,;\t|]+/);
    const ids: string[] = [];

    for (const line of lines) {
      const cleaned = line.trim();
      // Skip empty lines and potential headers
      if (cleaned && !cleaned.toLowerCase().includes('lead') && !cleaned.toLowerCase().includes('id')) {
        // Basic validation - should be alphanumeric
        if (/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
          ids.push(cleaned);
        }
      }
    }

    // Remove duplicates
    return [...new Set(ids)];
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (!droppedFile) return;

    // Simulate file input change
    const input = fileInputRef.current;
    if (input) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(droppedFile);
      input.files = dataTransfer.files;

      const event = new Event('change', { bubbles: true });
      input.dispatchEvent(event);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const startProcessing = async () => {
    if (leadIds.length === 0) {
      alert('No lead IDs to process');
      return;
    }

    setIsProcessing(true);
    setProgress({
      status: 'processing',
      message: 'Starting to process lead IDs...',
      current: 0,
      total: leadIds.length
    });

    try {
      const response = await fetch('/api/admin/process-lead-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_ids: leadIds,
          batch_size: batchSize,
          delay_ms: delayMs,
          dry_run: dryRun,
          skip_existing: skipExisting
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle SSE stream for progress updates
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

    } catch (error: any) {
      setProgress({
        status: 'error',
        message: error.message || 'Processing failed',
        current: 0,
        total: leadIds.length
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadResults = () => {
    // Create CSV content
    const headers = ['Lead ID', 'Status', 'Recordings Found', 'Error'];
    const rows = [headers.join(',')];

    // This would normally come from the progress stats
    // For now, create a simple report
    if (progress.stats) {
      rows.push(`Total,${progress.stats.total},,`);
      rows.push(`Successful,${progress.stats.successful},,`);
      rows.push(`Failed,${progress.stats.failed},,`);
      rows.push(`Recordings Found,${progress.stats.recordings_found},,`);
    }

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lead-processing-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/admin/test-tools')}
                className="mr-4 rounded-lg p-2 hover:bg-gray-100"
              >
                ←
              </button>
              <h1 className="text-2xl font-semibold">Upload Lead IDs</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-6">

          {/* File Upload Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-4">Upload File</h2>

            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer"
              >
                <div className="space-y-2">
                  <div className="text-4xl">📁</div>
                  <div className="text-gray-600">
                    Drop your file here or click to browse
                  </div>
                  <div className="text-sm text-gray-500">
                    Supports CSV, TXT, TSV files
                  </div>
                  {file && (
                    <div className="mt-4 p-2 bg-blue-50 rounded">
                      <span className="text-blue-700 font-medium">{file.name}</span>
                      <span className="text-blue-600 ml-2">({leadIds.length} IDs found)</span>
                    </div>
                  )}
                </div>
              </label>
            </div>

            {/* Preview Section */}
            {previewLeads.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Preview (first 10 IDs):</h3>
                <div className="bg-gray-50 rounded p-3">
                  <div className="grid grid-cols-5 gap-2 text-sm font-mono">
                    {previewLeads.map((id, idx) => (
                      <div key={idx} className="bg-white px-2 py-1 rounded border">
                        {id}
                      </div>
                    ))}
                  </div>
                  {leadIds.length > 10 && (
                    <div className="text-sm text-gray-500 mt-2">
                      ... and {leadIds.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Processing Options */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-4">Processing Options</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Batch Size
                </label>
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  disabled={isProcessing}
                >
                  <option value={10}>10 leads per batch (Slowest)</option>
                  <option value={25}>25 leads per batch (Moderate)</option>
                  <option value={50}>50 leads per batch (Fast)</option>
                  <option value={100}>100 leads per batch (Fastest)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delay Between Calls (ms)
                </label>
                <input
                  type="number"
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                  min={100}
                  max={5000}
                  step={100}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  disabled={isProcessing}
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  disabled={isProcessing}
                />
                <span className="text-sm font-medium">Dry Run (preview without saving)</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={skipExisting}
                  onChange={(e) => setSkipExisting(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  disabled={isProcessing}
                />
                <span className="text-sm font-medium">Skip Existing Leads</span>
              </label>
            </div>

            <div className="mt-6 flex space-x-3">
              <button
                onClick={startProcessing}
                disabled={!file || leadIds.length === 0 || isProcessing}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Processing...' : `Process ${leadIds.length} Lead IDs`}
              </button>

              {progress.status === 'complete' && (
                <button
                  onClick={downloadResults}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Download Results
                </button>
              )}
            </div>
          </div>

          {/* Progress Display */}
          {(isProcessing || progress.status !== 'idle') && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium mb-4">Processing Progress</h2>

              <div className="space-y-4">
                {/* Status Message */}
                <div className="flex items-center space-x-3">
                  {progress.status === 'processing' && (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                  )}
                  {progress.status === 'complete' && (
                    <span className="text-2xl">✅</span>
                  )}
                  {progress.status === 'error' && (
                    <span className="text-2xl">❌</span>
                  )}
                  <div>
                    <div className="font-medium">{progress.message}</div>
                    {progress.current_lead && (
                      <div className="text-sm text-gray-600">
                        Processing: {progress.current_lead}
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {progress.total > 0 && (
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>{progress.current} of {progress.total}</span>
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
                  <div className="grid grid-cols-4 gap-4 pt-4 border-t">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">
                        {progress.stats.total}
                      </div>
                      <div className="text-sm text-gray-600">Total</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {progress.stats.successful}
                      </div>
                      <div className="text-sm text-gray-600">Successful</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {progress.stats.failed}
                      </div>
                      <div className="text-sm text-gray-600">Failed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {progress.stats.recordings_found}
                      </div>
                      <div className="text-sm text-gray-600">Recordings</div>
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