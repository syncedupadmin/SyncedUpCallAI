'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
  Phone,
  Calendar,
  Clock,
  User,
  ChevronRight,
  Search,
  Download,
  RefreshCw,
  Filter
} from 'lucide-react';

interface Call {
  id: string;
  source: string;
  source_ref: string;
  campaign: string;
  disposition: string;
  direction: string;
  started_at: string;
  ended_at: string;
  duration_sec: number;
  recording_url: string;
  agent_id: string;
  agent_name?: string;
  phone_number?: string;
  created_at?: string;
  updated_at?: string;
}

export default function AdminCallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const router = useRouter();

  useEffect(() => {
    fetchCalls();
    const interval = setInterval(fetchCalls, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchCalls = async () => {
    try {
      setLoading(true);
      console.log('DEBUG - Fetching calls...');

      // Try the simpler endpoint first
      const response = await fetch('/api/admin/calls-simple');
      const data = await response.json();

      console.log('DEBUG - Full API response:', data);
      console.log('Calls API response:', {
        ok: data.ok,
        count: data.data?.length,
        sample: data.data?.[0]
      });

      if (data.ok) {
        console.log('DEBUG - Setting calls data:', data.data);
        setCalls(data.data || []);
        console.log(`Set ${data.data?.length || 0} calls to state`);
      } else {
        console.log('Primary endpoint failed, trying fallback...');
        // Fallback to original endpoint
        const fallbackResponse = await fetch('/api/admin/calls');
        const fallbackData = await fallbackResponse.json();

        console.log('Fallback response:', {
          ok: fallbackData.ok,
          count: fallbackData.data?.length
        });

        if (fallbackData.ok || fallbackData.data) {
          setCalls(fallbackData.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getFilteredCalls = () => {
    let filtered = calls;

    console.log('DEBUG - Starting filter with calls:', calls.length);
    console.log('DEBUG - First few calls:', calls.slice(0, 3));
    console.log('DEBUG - Filters:', { searchTerm, filter, dateFilter });

    // Text search
    if (searchTerm) {
      filtered = filtered.filter(call =>
        call.phone_number?.includes(searchTerm) ||
        call.agent_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        call.campaign?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      console.log('DEBUG - After search filter:', filtered.length);
    }

    // Direction filter
    if (filter !== 'all') {
      filtered = filtered.filter(call => call.direction === filter);
      console.log('DEBUG - After direction filter:', filtered.length);
    }

    // Date filter
    if (dateFilter !== 'all' && filtered.length > 0) {
      console.log('DEBUG - Applying date filter:', dateFilter);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      console.log('DEBUG - Date ranges:', { today, weekAgo, monthAgo });

      filtered = filtered.filter(call => {
        // Use created_at if started_at is invalid or missing
        let dateToUse = call.created_at;
        if (call.started_at) {
          const startedDate = new Date(call.started_at);
          if (startedDate.getFullYear() > 1970) {
            dateToUse = call.started_at;
          }
        }

        if (!dateToUse) {
          console.log('DEBUG - No date found for call:', call.id);
          return false;
        }
        const callDate = new Date(dateToUse);
        console.log('DEBUG - Call date:', callDate, 'for call:', call.id);

        let result = true;
        switch (dateFilter) {
          case 'today':
            result = callDate >= today;
            break;
          case 'week':
            result = callDate >= weekAgo;
            break;
          case 'month':
            result = callDate >= monthAgo;
            break;
          default:
            result = true;
        }
        console.log('DEBUG - Date filter result for call', call.id, ':', result);
        return result;
      });
      console.log('DEBUG - After date filter:', filtered.length);
    }

    console.log('DEBUG - Final filtered calls:', filtered.length);
    return filtered;
  };

  const filteredCalls = getFilteredCalls();

  const stats = {
    total: filteredCalls.length,
    inbound: filteredCalls.filter(c => c.direction === 'inbound').length,
    outbound: filteredCalls.filter(c => c.direction === 'outbound').length,
    avgDuration: filteredCalls.length > 0
      ? Math.round(filteredCalls.reduce((acc, c) => acc + (c.duration_sec || 0), 0) / filteredCalls.length)
      : 0
  };

  if (loading && calls.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-400">Loading calls...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent mb-2">
          Call Management
        </h1>
        <p className="text-gray-400">Monitor and manage all system calls</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Calls</div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Inbound</div>
          <div className="text-2xl font-bold text-green-400">{stats.inbound}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Outbound</div>
          <div className="text-2xl font-bold text-blue-400">{stats.outbound}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Duration</div>
          <div className="text-2xl font-bold text-purple-400">{formatDuration(stats.avgDuration)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search by phone, agent, or campaign..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>

          <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1">
            {(['all', 'inbound', 'outbound'] as const).map((filterOption) => (
              <button
                key={filterOption}
                onClick={() => setFilter(filterOption)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  filter === filterOption
                    ? 'bg-cyan-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={fetchCalls}
            disabled={loading}
            className="px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 rounded-lg text-gray-300 hover:text-white transition flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Debug Info */}
      <div className="mb-4 p-4 bg-yellow-900/20 border border-yellow-600 rounded-lg">
        <h3 className="text-yellow-400 font-bold mb-2">Debug Info</h3>
        <div className="text-sm text-yellow-200">
          <div>Calls in state: {calls.length}</div>
          <div>Filtered calls: {filteredCalls.length}</div>
          <div>Loading: {loading.toString()}</div>
          <div>Search term: "{searchTerm}"</div>
          <div>Direction filter: {filter}</div>
          <div>Date filter: {dateFilter}</div>
        </div>
      </div>

      {/* Calls Table */}
      <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50 border-b border-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Date/Time
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Phone Number
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Campaign
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Direction
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No calls found (Raw calls: {calls.length}, Filtered: {filteredCalls.length})
                  </td>
                </tr>
              ) : (
                filteredCalls.map((call) => (
                  <tr
                    key={call.id}
                    className="hover:bg-gray-800/30 transition"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        {call.started_at ? format(new Date(call.started_at), 'MMM dd, yyyy') : 'N/A'}
                        <Clock className="w-4 h-4 text-gray-500 ml-2" />
                        {call.started_at ? format(new Date(call.started_at), 'HH:mm') : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-white font-medium">
                        <Phone className="w-4 h-4 text-gray-500" />
                        {call.phone_number || 'Unknown'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <User className="w-4 h-4 text-gray-500" />
                        {call.agent_name || 'Unknown'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-300">
                        {call.campaign || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-300 font-mono">
                        {formatDuration(call.duration_sec)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        call.direction === 'inbound'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {call.direction || 'unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        call.disposition === 'completed'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : call.disposition === 'missed'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      }`}>
                        {call.disposition || 'unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/calls/${call.id}`)}
                          className="p-1.5 hover:bg-gray-700 rounded-lg transition"
                          title="View Details"
                        >
                          <ChevronRight className="w-4 h-4 text-gray-400 hover:text-white" />
                        </button>
                        {call.recording_url && (
                          <a
                            href={call.recording_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-gray-700 rounded-lg transition"
                            title="Download Recording"
                          >
                            <Download className="w-4 h-4 text-gray-400 hover:text-white" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}