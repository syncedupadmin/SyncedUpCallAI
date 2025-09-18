'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronUpDownIcon, PlayIcon } from '@heroicons/react/24/outline';

interface Call {
  recording_id: string;
  lead_id: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  recording_url: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone: string;
  customer_email: string;
  agent_id: string;
  agent_name: string;
  disposition: string;
  campaign_name: string;
  list_name: string;
}

interface FilterOptions {
  campaigns: string[];
  lists: string[];
  dispositions: string[];
  agents: string[];
}

export default function ConvosoImporter() {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [calls, setCalls] = useState<Call[]>([]);
  const [filteredCalls, setFilteredCalls] = useState<Call[]>([]);
  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set());
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    campaigns: [],
    lists: [],
    dispositions: [],
    agents: []
  });

  // Search parameters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');

  // Filters
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedDisposition, setSelectedDisposition] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedList, setSelectedList] = useState('');
  const [minDuration, setMinDuration] = useState(1); // Minimum 1 second (no abandoned calls)
  const [maxDuration, setMaxDuration] = useState(3600);

  // Sorting
  const [sortField, setSortField] = useState<keyof Call>('start_time');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const searchCalls = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Please select date range');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/convoso/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateFrom,
          dateTo,
          timeFrom,
          timeTo
        })
      });

      if (!response.ok) {
        throw new Error('Failed to search calls');
      }

      const data = await response.json();
      setCalls(data.calls);
      setFilteredCalls(data.calls);
      setFilterOptions(data.filterOptions);
      setSelectedCalls(new Set());

      toast.success(`Found ${data.calls.length} calls`);
    } catch (error) {
      console.error('Error searching calls:', error);
      toast.error('Failed to search calls');
    } finally {
      setLoading(false);
    }
  };

  const importSelectedCalls = async () => {
    if (selectedCalls.size === 0) {
      toast.error('Please select calls to import');
      return;
    }

    setImporting(true);
    try {
      const callsToImport = calls.filter(call =>
        selectedCalls.has(call.recording_id)
      );

      const response = await fetch('/api/convoso/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          calls: callsToImport
        })
      });

      if (!response.ok) {
        throw new Error('Failed to import calls');
      }

      const data = await response.json();
      toast.success(`Imported ${data.imported} calls, ${data.queued_for_transcription} queued for transcription`);

      // Clear selection
      setSelectedCalls(new Set());
    } catch (error) {
      console.error('Error importing calls:', error);
      toast.error('Failed to import calls');
    } finally {
      setImporting(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...calls];

    if (selectedAgent) {
      filtered = filtered.filter(c => c.agent_name === selectedAgent);
    }
    if (selectedDisposition) {
      filtered = filtered.filter(c => c.disposition === selectedDisposition);
    }
    if (selectedCampaign) {
      filtered = filtered.filter(c => c.campaign_name === selectedCampaign);
    }
    if (selectedList) {
      filtered = filtered.filter(c => c.list_name === selectedList);
    }

    filtered = filtered.filter(c =>
      c.duration_seconds >= minDuration && c.duration_seconds <= maxDuration
    );

    // Apply sorting
    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (typeof aVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      } else {
        return sortDirection === 'asc'
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      }
    });

    setFilteredCalls(filtered);
  };

  const toggleSort = (field: keyof Call) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedCalls.size === filteredCalls.length) {
      setSelectedCalls(new Set());
    } else {
      setSelectedCalls(new Set(filteredCalls.map(c => c.recording_id)));
    }
  };

  const toggleSelectCall = (recordingId: string) => {
    const newSelection = new Set(selectedCalls);
    if (newSelection.has(recordingId)) {
      newSelection.delete(recordingId);
    } else {
      newSelection.add(recordingId);
    }
    setSelectedCalls(newSelection);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const playRecording = (url: string) => {
    window.open(url, '_blank');
  };

  // Apply filters when they change
  const handleFilterChange = () => {
    applyFilters();
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-6">Convoso Call Importer</h2>

        {/* Search Section */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-4">Search Calls</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time From (optional)</label>
              <input
                type="time"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time To (optional)</label>
              <input
                type="time"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>
          <button
            onClick={searchCalls}
            disabled={loading}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search Calls'}
          </button>
        </div>

        {/* Filters Section */}
        {calls.length > 0 && (
          <div className="mb-6 p-4 border rounded-lg">
            <h3 className="font-semibold mb-4">Filters</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Agent</label>
                <select
                  value={selectedAgent}
                  onChange={(e) => {
                    setSelectedAgent(e.target.value);
                    handleFilterChange();
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">All Agents</option>
                  {filterOptions.agents.map(agent => (
                    <option key={agent} value={agent}>{agent}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Disposition</label>
                <select
                  value={selectedDisposition}
                  onChange={(e) => {
                    setSelectedDisposition(e.target.value);
                    handleFilterChange();
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">All Dispositions</option>
                  {filterOptions.dispositions.map(disp => (
                    <option key={disp} value={disp}>{disp}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Campaign</label>
                <select
                  value={selectedCampaign}
                  onChange={(e) => {
                    setSelectedCampaign(e.target.value);
                    handleFilterChange();
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">All Campaigns</option>
                  {filterOptions.campaigns.map(camp => (
                    <option key={camp} value={camp}>{camp}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">List</label>
                <select
                  value={selectedList}
                  onChange={(e) => {
                    setSelectedList(e.target.value);
                    handleFilterChange();
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">All Lists</option>
                  {filterOptions.lists.map(list => (
                    <option key={list} value={list}>{list}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Min Duration (sec)</label>
                <input
                  type="number"
                  value={minDuration}
                  min="1"
                  onChange={(e) => {
                    setMinDuration(Math.max(1, Number(e.target.value)));
                    handleFilterChange();
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Duration (sec)</label>
                <input
                  type="number"
                  value={maxDuration}
                  onChange={(e) => {
                    setMaxDuration(Number(e.target.value));
                    handleFilterChange();
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {/* Results Table */}
        {filteredCalls.length > 0 && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">
                Results ({filteredCalls.length} calls, {selectedCalls.size} selected)
              </h3>
              <button
                onClick={importSelectedCalls}
                disabled={importing || selectedCalls.size === 0}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {importing ? 'Importing...' : `Import Selected (${selectedCalls.size})`}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedCalls.size === filteredCalls.length}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th
                      onClick={() => toggleSort('start_time')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    >
                      <div className="flex items-center gap-1">
                        Date/Time
                        <ChevronUpDownIcon className="h-4 w-4" />
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('customer_phone')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    >
                      <div className="flex items-center gap-1">
                        Customer
                        <ChevronUpDownIcon className="h-4 w-4" />
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('agent_name')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    >
                      <div className="flex items-center gap-1">
                        Agent
                        <ChevronUpDownIcon className="h-4 w-4" />
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('duration_seconds')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    >
                      <div className="flex items-center gap-1">
                        Duration
                        <ChevronUpDownIcon className="h-4 w-4" />
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('disposition')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    >
                      <div className="flex items-center gap-1">
                        Disposition
                        <ChevronUpDownIcon className="h-4 w-4" />
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('campaign_name')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                    >
                      <div className="flex items-center gap-1">
                        Campaign
                        <ChevronUpDownIcon className="h-4 w-4" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recording
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCalls.map((call) => (
                    <tr key={call.recording_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedCalls.has(call.recording_id)}
                          onChange={() => toggleSelectCall(call.recording_id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {new Date(call.start_time).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div>
                          <div className="font-medium">
                            {call.customer_first_name} {call.customer_last_name}
                          </div>
                          <div className="text-gray-500">{call.customer_phone}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {call.agent_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {formatDuration(call.duration_seconds)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          call.disposition === 'SALE' ? 'bg-green-100 text-green-800' :
                          call.disposition === 'CALLBACK' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {call.disposition}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {call.campaign_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {call.recording_url && (
                          <button
                            onClick={() => playRecording(call.recording_url)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Play recording"
                          >
                            <PlayIcon className="h-5 w-5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No results message */}
        {calls.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">
            Search for calls to import them into the system
          </div>
        )}
      </div>
    </div>
  );
}