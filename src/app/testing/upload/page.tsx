'use client';

import { useState } from 'react';
import { Upload, Loader2, CheckCircle, XCircle, FileAudio } from 'lucide-react';

export default function TestAudioUpload() {
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(e.target.files);
      setResults(null);
    }
  };

  const uploadFiles = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      alert('Please select files first');
      return;
    }

    setUploading(true);
    setProgress({ current: 0, total: selectedFiles.length });

    try {
      // Create test suite
      const suiteRes = await fetch('/api/testing/create-suite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Bulk Upload ${new Date().toISOString().split('T')[0]}`,
          description: `Uploaded ${selectedFiles.length} audio files for testing`
        })
      });

      const suiteData = await suiteRes.json();
      const suiteId = suiteData.suite?.id;

      if (!suiteId) {
        throw new Error('Failed to create test suite');
      }

      const uploadResults = {
        suite_id: suiteId,
        total: selectedFiles.length,
        succeeded: [] as string[],
        failed: [] as { file: string; error: string }[]
      };

      // Upload each file
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProgress({ current: i + 1, total: selectedFiles.length });

        try {
          // Create FormData
          const formData = new FormData();
          formData.append('file', file);
          formData.append('suite_id', suiteId);
          formData.append('filename', file.name);

          // Extract metadata from filename if it matches pattern
          const parts = file.name.replace('.mp3', '').split('_');
          if (parts.length > 5) {
            formData.append('metadata', JSON.stringify({
              account: parts[0],
              campaign: parts[1],
              lead_id: parts[2],
              agent_id: parts[3],
              list: parts[4],
              timestamp: parts[5]
            }));
          }

          // Upload file
          const uploadRes = await fetch('/api/testing/upload-audio', {
            method: 'POST',
            body: formData
          });

          const uploadData = await uploadRes.json();

          if (uploadData.success) {
            uploadResults.succeeded.push(file.name);
          } else {
            uploadResults.failed.push({
              file: file.name,
              error: uploadData.error || 'Unknown error'
            });
          }

        } catch (error: any) {
          uploadResults.failed.push({
            file: file.name,
            error: error.message
          });
        }

        // Small delay between uploads
        if (i < selectedFiles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      setResults(uploadResults);

    } catch (error: any) {
      alert('Upload failed: ' + error.message);
    } finally {
      setUploading(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Upload Test Audio Files</h1>

        {/* File Selection */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Select Audio Files</h2>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <FileAudio className="w-12 h-12 text-gray-400 mx-auto mb-4" />

            <input
              type="file"
              id="file-input"
              multiple
              accept="audio/mp3,audio/mpeg"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />

            <label
              htmlFor="file-input"
              className="cursor-pointer inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Upload className="w-5 h-5 mr-2" />
              Select MP3 Files
            </label>

            {selectedFiles && (
              <div className="mt-4 text-sm text-gray-600">
                {selectedFiles.length} files selected
              </div>
            )}
          </div>

          {selectedFiles && selectedFiles.length > 0 && (
            <div className="mt-4">
              <button
                onClick={uploadFiles}
                disabled={uploading}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Uploading {progress.current}/{progress.total}...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Upload All Files
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Progress */}
        {uploading && progress.total > 0 && (
          <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
            <h3 className="font-semibold mb-2">Upload Progress</h3>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-2">
              {progress.current} of {progress.total} files uploaded
            </p>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold mb-4">Upload Results</h3>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                  <span className="font-semibold">Succeeded</span>
                </div>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  {results.succeeded.length}
                </p>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <XCircle className="w-5 h-5 text-red-600 mr-2" />
                  <span className="font-semibold">Failed</span>
                </div>
                <p className="text-2xl font-bold text-red-600 mt-2">
                  {results.failed.length}
                </p>
              </div>
            </div>

            {results.suite_id && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm">
                  <strong>Test Suite ID:</strong> {results.suite_id}
                </p>
              </div>
            )}

            {results.failed.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-600">
                  View failed uploads
                </summary>
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {results.failed.map((item: any, idx: number) => (
                    <div key={idx} className="text-xs text-red-600">
                      {item.file}: {item.error}
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="mt-6 pt-6 border-t">
              <a
                href="/testing/dashboard"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Go to Testing Dashboard →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}