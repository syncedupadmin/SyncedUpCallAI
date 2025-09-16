'use client';

import { useState, useEffect } from 'react';

interface UnmatchedRecording {
  id: string;
  lead_id: string;
  recording_id: string;
  recording_url: string;
  start_time: string;
  duration_seconds: number;
  potential_matches: any[];
  created_at: string;
}

interface Call {
  id: string;
  agent_name: string;
  started_at: string;
  duration_sec: number;
  lead_id: string;
}

export default function ReviewRecordingsPage() {
  const [recordings, setRecordings] = useState<UnmatchedRecording[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<string | null>(null);

  useEffect(() => {
    fetchUnmatchedRecordings();
  }, []);

  const fetchUnmatchedRecordings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/unmatched-recordings');
      const data = await response.json();
      setRecordings(data.recordings || []);
    } catch (error) {
      console.error('Error fetching recordings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCallsForLead = async (leadId: string) => {
    try {
      const response = await fetch(`/api/admin/calls-for-lead?lead_id=${leadId}`);
      const data = await response.json();
      setCalls(data.calls || []);
    } catch (error) {
      console.error('Error fetching calls:', error);
    }
  };

  const handleRecordingSelect = (recording: UnmatchedRecording) => {
    setSelectedRecording(recording.id);
    fetchCallsForLead(recording.lead_id);
  };

  const assignRecording = async () => {
    if (!selectedRecording || !selectedCall) {
      alert('Please select both a recording and a call');
      return;
    }

    try {
      const response = await fetch('/api/admin/assign-recording', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_id: selectedRecording,
          call_id: selectedCall
        })
      });

      if (response.ok) {
        alert('Recording assigned successfully');
        fetchUnmatchedRecordings();
        setSelectedRecording(null);
        setSelectedCall(null);
        setCalls([]);
      } else {
        alert('Failed to assign recording');
      }
    } catch (error) {
      console.error('Error assigning recording:', error);
      alert('Error assigning recording');
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Review Unmatched Recordings</h1>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Unmatched Recordings List */}
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">
              Unmatched Recordings ({recordings.length})
            </h2>

            <div className="space-y-2">
              {recordings.map((recording) => (
                <div
                  key={recording.id}
                  onClick={() => handleRecordingSelect(recording)}
                  className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                    selectedRecording === recording.id ? 'bg-blue-50 border-blue-500' : ''
                  }`}
                >
                  <div className="font-medium">Lead: {recording.lead_id}</div>
                  <div className="text-sm text-gray-600">
                    Recording ID: {recording.recording_id}
                  </div>
                  <div className="text-sm text-gray-600">
                    Start: {formatTime(recording.start_time)}
                  </div>
                  <div className="text-sm text-gray-600">
                    Duration: {formatDuration(recording.duration_seconds)}
                  </div>
                  {recording.potential_matches?.length > 0 && (
                    <div className="text-sm text-amber-600 mt-1">
                      {recording.potential_matches.length} potential match(es)
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Available Calls for Selected Lead */}
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">
              Available Calls {calls.length > 0 && `(${calls.length})`}
            </h2>

            {selectedRecording ? (
              <div className="space-y-2">
                {calls.map((call) => (
                  <div
                    key={call.id}
                    onClick={() => setSelectedCall(call.id)}
                    className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                      selectedCall === call.id ? 'bg-green-50 border-green-500' : ''
                    }`}
                  >
                    <div className="font-medium">
                      Agent: {call.agent_name || 'Unknown'}
                    </div>
                    <div className="text-sm text-gray-600">
                      Start: {formatTime(call.started_at)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Duration: {formatDuration(call.duration_sec || 0)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Call ID: {call.id.substring(0, 8)}...
                    </div>
                  </div>
                ))}

                {calls.length === 0 && (
                  <div className="text-gray-500 text-center py-8">
                    No calls found for this lead
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8">
                Select a recording to see available calls
              </div>
            )}

            {selectedRecording && selectedCall && (
              <button
                onClick={assignRecording}
                className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
              >
                Assign Recording to Selected Call
              </button>
            )}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-semibold mb-2">Matching Stats</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Unmatched: </span>
            <span className="font-medium">{recordings.length}</span>
          </div>
          <div>
            <span className="text-gray-600">With Potential Matches: </span>
            <span className="font-medium">
              {recordings.filter(r => r.potential_matches?.length > 0).length}
            </span>
          </div>
          <div>
            <span className="text-gray-600">No Matches: </span>
            <span className="font-medium">
              {recordings.filter(r => !r.potential_matches?.length).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}