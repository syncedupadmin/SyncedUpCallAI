'use client';

import { useState, useCallback } from 'react';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  Info,
  FileText,
  Database,
  RefreshCw
} from 'lucide-react';

type UploadType = 'calls' | 'leads' | 'agents';
type FileType = 'csv' | 'excel';

interface UploadResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
  duplicates: number;
  created: number;
  updated: number;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export default function BulkUploadPage() {
  const [selectedType, setSelectedType] = useState<UploadType>('calls');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // CSV Template structures
  const templates = {
    calls: {
      headers: ['lead_id', 'call_id', 'phone_number', 'agent_name', 'disposition', 'duration_sec', 'started_at', 'ended_at', 'campaign', 'recording_url'],
      sample: ['CONVOSO-123', 'CALL-001', '555-0123', 'John Agent', 'INTERESTED', '180', '2024-12-16 10:00:00', '2024-12-16 10:03:00', 'Campaign A', 'https://example.com/recording.mp3']
    },
    leads: {
      headers: ['lead_id', 'first_name', 'last_name', 'email', 'phone_number', 'address', 'city', 'state', 'zip', 'status'],
      sample: ['LEAD-001', 'John', 'Doe', 'john@example.com', '555-0123', '123 Main St', 'Phoenix', 'AZ', '85001', 'NEW']
    },
    agents: {
      headers: ['email', 'name', 'phone', 'team', 'role'],
      sample: ['agent@example.com', 'Jane Agent', '555-0456', 'Team A', 'agent']
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setResult(null);
    setValidationErrors([]);

    // Parse and preview first 5 rows
    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      await previewCSV(file);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      await previewExcel(file);
    }
  };

  const previewCSV = async (file: File) => {
    setValidating(true);
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());

    const previewData = lines.slice(1, 6).map((line, index) => {
      const values = line.split(',').map(v => v.trim());
      const row: any = { _row: index + 2 };
      headers.forEach((header, i) => {
        row[header] = values[i] || '';
      });
      return row;
    });

    setPreview(previewData);
    validateData(previewData, headers);
    setValidating(false);
  };

  const previewExcel = async (file: File) => {
    setValidating(true);
    // For Excel, we'll send to backend for parsing
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', selectedType);

    try {
      const response = await fetch('/api/admin/bulk-upload/preview', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setPreview(data.preview);
        validateData(data.preview, data.headers);
      }
    } catch (error) {
      console.error('Preview error:', error);
    }
    setValidating(false);
  };

  const validateData = (data: any[], headers: string[]) => {
    const errors: ValidationError[] = [];

    data.forEach((row) => {
      // Type-specific validation
      if (selectedType === 'calls') {
        // For calls, require either lead_id OR call_id (not both required)
        if (!row.lead_id && !row.call_id) {
          errors.push({
            row: row._row,
            field: 'lead_id/call_id',
            message: 'Either lead_id or call_id is required'
          });
        }

        // Validate duration if provided
        if (row.duration_sec && isNaN(Number(row.duration_sec))) {
          errors.push({
            row: row._row,
            field: 'duration_sec',
            message: 'Duration must be a number'
          });
        }
      }

      if (selectedType === 'leads') {
        // For leads, require lead_id OR (email OR phone_number)
        if (!row.lead_id && !row.email && !row.phone_number) {
          errors.push({
            row: row._row,
            field: 'lead_id/email/phone',
            message: 'Either lead_id, email, or phone_number is required'
          });
        }

        // Validate email format if provided
        if (row.email && !row.email.includes('@')) {
          errors.push({
            row: row._row,
            field: 'email',
            message: 'Invalid email format'
          });
        }
      }

      if (selectedType === 'agents') {
        // For agents, email is required
        if (!row.email || row.email.toString().trim() === '') {
          errors.push({
            row: row._row,
            field: 'email',
            message: 'Email is required for agents'
          });
        }
      }
    });

    setValidationErrors(errors);
  };

  const downloadTemplate = () => {
    const template = templates[selectedType];
    const csv = [
      template.headers.join(','),
      template.sample.join(',')
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedType}_template.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!selectedFile || validationErrors.length > 0) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('type', selectedType);

    try {
      const response = await fetch('/api/admin/bulk-upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        setResult(result);
        if (result.success) {
          setSelectedFile(null);
          setPreview([]);
        }
      } else {
        const error = await response.json();
        setResult({
          success: false,
          processed: 0,
          failed: 0,
          errors: [error.message || 'Upload failed'],
          duplicates: 0,
          created: 0,
          updated: 0
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      setResult({
        success: false,
        processed: 0,
        failed: 0,
        errors: ['Network error. Please try again.'],
        duplicates: 0,
        created: 0,
        updated: 0
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <Database className="w-8 h-8 text-blue-400" />
          Bulk Data Upload
        </h1>

        {/* Upload Type Selection */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Select Data Type</h2>
          <div className="grid grid-cols-3 gap-4">
            {(['calls', 'leads', 'agents'] as UploadType[]).map(type => (
              <button
                key={type}
                onClick={() => {
                  setSelectedType(type);
                  setSelectedFile(null);
                  setPreview([]);
                  setResult(null);
                }}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedType === type
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="text-lg font-medium capitalize mb-1">{type}</div>
                <div className="text-sm text-gray-400">
                  {type === 'calls' && 'Import call records with recordings'}
                  {type === 'leads' && 'Import customer leads and contacts'}
                  {type === 'agents' && 'Import agent profiles'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Download Template */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-4">
            <Info className="w-5 h-5 text-blue-400 mt-1" />
            <div className="flex-1">
              <h3 className="font-semibold mb-2">Download Template</h3>
              <p className="text-sm text-gray-400 mb-4">
                Use our template to ensure your data is formatted correctly. The template includes all required fields and a sample row.
              </p>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Download {selectedType} Template
              </button>
            </div>
          </div>
        </div>

        {/* File Upload Area */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Upload File</h2>
          <div
            className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-all ${
              dragActive
                ? 'border-blue-500 bg-blue-500/10'
                : selectedFile
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-gray-700 hover:border-gray-600'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className="pointer-events-none">
              {selectedFile ? (
                <>
                  <FileSpreadsheet className="w-12 h-12 text-green-400 mx-auto mb-4" />
                  <p className="text-lg font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-gray-400">
                    {((selectedFile?.size || 0) / 1024).toFixed(2)} KB
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium">
                    Drag and drop your file here
                  </p>
                  <p className="text-sm text-gray-400 mt-2">
                    or click to browse (CSV or Excel)
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Preview & Validation */}
        {preview.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              Preview & Validation
              {validating && <Loader2 className="w-4 h-4 animate-spin" />}
            </h2>

            {validationErrors.length > 0 && (
              <div className="mb-4 p-4 bg-red-900/20 border border-red-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-400 mb-2">
                      {validationErrors.length} validation {validationErrors.length === 1 ? 'error' : 'errors'} found
                    </p>
                    <ul className="text-sm space-y-1">
                      {validationErrors.slice(0, 5).map((error, i) => (
                        <li key={i} className="text-gray-300">
                          Row {error.row}: {error.field} - {error.message}
                        </li>
                      ))}
                      {validationErrors.length > 5 && (
                        <li className="text-gray-400">
                          ...and {validationErrors.length - 5} more
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-3 py-2 text-left text-gray-400">Row</th>
                    {templates[selectedType].headers.slice(0, 5).map(header => (
                      <th key={header} className="px-3 py-2 text-left text-gray-400">
                        {header}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left text-gray-400">...</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b border-gray-800">
                      <td className="px-3 py-2">{row._row}</td>
                      {templates[selectedType].headers.slice(0, 5).map(header => (
                        <td key={header} className="px-3 py-2">
                          {row[header] || '-'}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-gray-500">...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-between items-center">
              <p className="text-sm text-gray-400">
                Showing first 5 rows of {selectedFile?.name}
              </p>
              <button
                onClick={handleUpload}
                disabled={uploading || validationErrors.length > 0}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all ${
                  uploading || validationErrors.length > 0
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload Data
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Upload Result */}
        {result && (
          <div className={`border rounded-lg p-6 ${
            result.success
              ? 'bg-green-900/20 border-green-800'
              : 'bg-red-900/20 border-red-800'
          }`}>
            <div className="flex items-start gap-4">
              {result.success ? (
                <CheckCircle className="w-6 h-6 text-green-400 mt-0.5" />
              ) : (
                <XCircle className="w-6 h-6 text-red-400 mt-0.5" />
              )}
              <div className="flex-1">
                <h3 className={`text-lg font-semibold mb-2 ${
                  result.success ? 'text-green-400' : 'text-red-400'
                }`}>
                  {result.success ? 'Upload Successful!' : 'Upload Failed'}
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-400">Processed</p>
                    <p className="text-xl font-semibold">{result.processed}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Created</p>
                    <p className="text-xl font-semibold text-green-400">{result.created}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Updated</p>
                    <p className="text-xl font-semibold text-blue-400">{result.updated}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Failed</p>
                    <p className="text-xl font-semibold text-red-400">{result.failed}</p>
                  </div>
                </div>

                {result.duplicates > 0 && (
                  <p className="text-sm text-yellow-400 mb-2">
                    {result.duplicates} duplicate {result.duplicates === 1 ? 'record' : 'records'} skipped
                  </p>
                )}

                {result.errors.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Errors:</p>
                    <ul className="text-sm text-gray-300 space-y-1">
                      {result.errors.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.success && (
                  <button
                    onClick={() => {
                      setResult(null);
                      setSelectedFile(null);
                      setPreview([]);
                    }}
                    className="mt-4 flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Upload Another File
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}