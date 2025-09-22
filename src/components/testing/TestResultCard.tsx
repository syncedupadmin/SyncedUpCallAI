'use client';

import { useState } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  Edit,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileAudio,
  MessageSquare,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface TestResult {
  id: string;
  test_case_name: string;
  test_category: string;
  status: 'completed' | 'failed' | 'running';
  audio_url: string;
  expected_transcript?: string;
  actual_transcript?: string;
  transcript_wer?: number;
  transcript_cer?: number;
  confidence?: number;
  expected_analysis?: any;
  actual_analysis?: any;
  classification_correct?: boolean;
  execution_time_ms: number;
  error_message?: string;
}

interface TestResultCardProps {
  result: TestResult;
  onFeedback: (testRunId: string, feedback: any) => void;
}

export default function TestResultCard({ result, onFeedback }: TestResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackData, setFeedbackData] = useState({
    rating: 0,
    error_category: '',
    error_severity: 'minor',
    corrected_transcript: '',
    notes: ''
  });

  const submitFeedback = async () => {
    try {
      const response = await fetch('/api/testing/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_run_id: result.id,
          ...feedbackData
        })
      });

      if (response.ok) {
        toast.success('Feedback submitted successfully');
        onFeedback(result.id, feedbackData);
        setShowFeedbackForm(false);
      } else {
        toast.error('Failed to submit feedback');
      }
    } catch (error) {
      toast.error('Error submitting feedback');
      console.error(error);
    }
  };

  const getAccuracyColor = (wer: number) => {
    if (wer < 0.05) return 'text-green-600 bg-green-50';
    if (wer < 0.15) return 'text-yellow-600 bg-yellow-50';
    if (wer < 0.25) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const getStatusIcon = () => {
    switch (result.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const highlightDifferences = (expected: string, actual: string) => {
    // Simple word-level diff highlighting
    const expectedWords = expected.split(' ');
    const actualWords = actual.split(' ');

    return actualWords.map((word, idx) => {
      if (idx >= expectedWords.length) {
        return <span key={idx} className="bg-red-100 px-1">{word} </span>;
      }
      if (word !== expectedWords[idx]) {
        return <span key={idx} className="bg-yellow-100 px-1">{word} </span>;
      }
      return <span key={idx}>{word} </span>;
    });
  };

  return (
    <div className="bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getStatusIcon()}
            <div>
              <h3 className="text-sm font-medium text-gray-900">{result.test_case_name}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {result.test_category}
                </span>
                {result.transcript_wer !== undefined && (
                  <span className={`text-xs px-2 py-1 rounded ${getAccuracyColor(result.transcript_wer)}`}>
                    WER: {(result.transcript_wer * 100).toFixed(1)}%
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  {(result.execution_time_ms / 1000).toFixed(2)}s
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Actions */}
            <button
              onClick={() => setFeedbackData({ ...feedbackData, rating: 1 })}
              className={`p-2 rounded-lg hover:bg-gray-100 ${feedbackData.rating === 1 ? 'bg-green-100' : ''}`}
              title="Mark as correct"
            >
              <ThumbsUp className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => setFeedbackData({ ...feedbackData, rating: -1 })}
              className={`p-2 rounded-lg hover:bg-gray-100 ${feedbackData.rating === -1 ? 'bg-red-100' : ''}`}
              title="Mark as incorrect"
            >
              <ThumbsDown className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => setShowFeedbackForm(!showFeedbackForm)}
              className="p-2 rounded-lg hover:bg-gray-100"
              title="Provide detailed feedback"
            >
              <Edit className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-600" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Audio Player */}
      {result.audio_url && (
        <div className="px-6 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <FileAudio className="w-4 h-4 text-gray-500" />
            <audio controls className="flex-1" src={result.audio_url}>
              Your browser does not support the audio element.
            </audio>
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {expanded && (
        <div className="px-6 py-4 space-y-4">
          {/* Transcription Comparison */}
          {result.expected_transcript && result.actual_transcript && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-900">Transcription Comparison</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Expected</p>
                  <div className="p-3 bg-green-50 rounded text-sm text-gray-800">
                    {result.expected_transcript}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">
                    Actual ({result.confidence ? `${(result.confidence * 100).toFixed(0)}% confidence` : 'N/A'})
                  </p>
                  <div className="p-3 bg-blue-50 rounded text-sm text-gray-800">
                    {result.expected_transcript ? (
                      <div>{highlightDifferences(result.expected_transcript, result.actual_transcript)}</div>
                    ) : (
                      result.actual_transcript
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Analysis Comparison */}
          {result.expected_analysis && result.actual_analysis && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-900">Analysis Comparison</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Expected Analysis</p>
                  <div className="p-3 bg-gray-50 rounded">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                      {JSON.stringify(result.expected_analysis, null, 2)}
                    </pre>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Actual Analysis</p>
                  <div className="p-3 bg-gray-50 rounded">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                      {JSON.stringify(result.actual_analysis, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {result.error_message && (
            <div className="p-3 bg-red-50 rounded">
              <p className="text-sm text-red-800">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                {result.error_message}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Feedback Form */}
      {showFeedbackForm && (
        <div className="px-6 py-4 border-t bg-gray-50">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Provide Feedback</h4>
          <div className="space-y-3">
            {/* Error Category */}
            <div>
              <label className="block text-xs text-gray-700 mb-1">Error Category</label>
              <select
                value={feedbackData.error_category}
                onChange={(e) => setFeedbackData({ ...feedbackData, error_category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select category...</option>
                <option value="missed_words">Missed Words</option>
                <option value="wrong_words">Wrong Words</option>
                <option value="extra_words">Extra Words</option>
                <option value="speaker_confusion">Speaker Confusion</option>
                <option value="accent_misunderstanding">Accent Misunderstanding</option>
                <option value="technical_term_error">Technical Term Error</option>
                <option value="number_error">Number Error</option>
                <option value="name_error">Name Error</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Error Severity */}
            <div>
              <label className="block text-xs text-gray-700 mb-1">Severity</label>
              <div className="flex gap-2">
                {['minor', 'moderate', 'major', 'critical'].map((severity) => (
                  <button
                    key={severity}
                    onClick={() => setFeedbackData({ ...feedbackData, error_severity: severity })}
                    className={`px-3 py-1 text-xs rounded-lg capitalize ${
                      feedbackData.error_severity === severity
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {severity}
                  </button>
                ))}
              </div>
            </div>

            {/* Corrected Transcript */}
            <div>
              <label className="block text-xs text-gray-700 mb-1">Corrected Transcript (optional)</label>
              <textarea
                value={feedbackData.corrected_transcript}
                onChange={(e) => setFeedbackData({ ...feedbackData, corrected_transcript: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Enter the correct transcript..."
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs text-gray-700 mb-1">Additional Notes</label>
              <textarea
                value={feedbackData.notes}
                onChange={(e) => setFeedbackData({ ...feedbackData, notes: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Any additional context or notes..."
              />
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowFeedbackForm(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitFeedback}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}