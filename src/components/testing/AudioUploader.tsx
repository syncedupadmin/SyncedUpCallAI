'use client';

import { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { Upload, X, FileAudio, Loader2 } from 'lucide-react';

interface AudioUploaderProps {
  suiteId: string;
  onUploadComplete?: () => void;
}

export default function AudioUploader({ suiteId, onUploadComplete }: AudioUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [audioUrls, setAudioUrls] = useState<string>('');

  const handleBulkCreate = async () => {
    if (!audioUrls.trim()) {
      toast.error('Please enter at least one audio URL');
      return;
    }

    setUploading(true);
    const urls = audioUrls.split('\n').map(url => url.trim()).filter(url => url);

    try {
      const res = await fetch('/api/testing/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suite_id: suiteId,
          audio_urls: urls
        })
      });

      const data = await res.json();

      if (data.success) {
        toast.success(`Created ${data.imported} test cases!`);
        setAudioUrls('');
        setIsOpen(false);
        onUploadComplete?.();
      } else {
        toast.error(data.error || 'Failed to create test cases');
      }
    } catch (error) {
      toast.error('Failed to upload');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];

    if (!file.name.endsWith('.mp3') && !file.name.endsWith('.wav')) {
      toast.error('Please select an MP3 or WAV file');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('suite_id', suiteId);

    try {
      const res = await fetch('/api/testing/upload-calls', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Audio file uploaded successfully!');
        setIsOpen(false);
        onUploadComplete?.();
      } else {
        toast.error(data.error || 'Upload failed');
      }
    } catch (error) {
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2"
      >
        <Upload className="w-4 h-4" />
        Upload Test Audio
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-900">
            <FileAudio className="w-5 h-5 text-blue-600" />
            Upload Test Audio
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-gray-700"
            disabled={uploading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* File Upload */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Upload Audio File</h3>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <FileAudio className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm text-gray-600 mb-2">
                Drag and drop an MP3 or WAV file here, or click to select
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Select File
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">OR</span>
            </div>
          </div>

          {/* Bulk URL Input */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Bulk Import from URLs</h3>
            <textarea
              value={audioUrls}
              onChange={(e) => setAudioUrls(e.target.value)}
              placeholder="Enter audio URLs, one per line&#10;&#10;Example:&#10;https://example.com/audio1.mp3&#10;https://example.com/audio2.mp3"
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={uploading}
            />
            <p className="mt-2 text-xs text-gray-500">
              Enter direct URLs to MP3 or WAV files. Each URL will become a test case.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-between">
          <button
            onClick={() => setIsOpen(false)}
            disabled={uploading}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleBulkCreate}
            disabled={uploading || !audioUrls.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Create Test Cases
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}