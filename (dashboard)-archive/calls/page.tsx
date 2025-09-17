'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Phone, Calendar, Clock, User, ChevronRight, Search } from 'lucide-react';

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
}

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    fetchCalls();
  }, []);

  const fetchCalls = async () => {
    try {
      setLoading(true);

      // Check if user is admin to determine which endpoint to use
      const { data: isAdmin } = await supabase.rpc('is_admin');

      const endpoint = isAdmin ? '/api/admin/calls' : '/api/calls';
      const response = await fetch(endpoint);
      const data = await response.json();

      if (data.ok || data.data) {
        setCalls(data.data || []);
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

  const filteredCalls = calls.filter(call => {
    const matchesSearch = searchTerm === '' ||
      call.phone_number?.includes(searchTerm) ||
      call.agent_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.campaign?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filter === 'all' ||
      (filter === 'inbound' && call.direction === 'inbound') ||
      (filter === 'outbound' && call.direction === 'outbound');

    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-96">
            <div className="text-gray-400">Loading calls...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-2">
            Call History
          </h1>
          <p className="text-gray-400">View and manage all call records</p>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row gap-4">
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
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition ${
                filter === 'all'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
              }`}
            >
              All Calls
            </button>
            <button
              onClick={() => setFilter('inbound')}
              className={`px-4 py-2 rounded-lg transition ${
                filter === 'inbound'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
              }`}
            >
              Inbound
            </button>
            <button
              onClick={() => setFilter('outbound')}
              className={`px-4 py-2 rounded-lg transition ${
                filter === 'outbound'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
              }`}
            >
              Outbound
            </button>
          </div>
        </div>

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
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredCalls.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      No calls found
                    </td>
                  </tr>
                ) : (
                  filteredCalls.map((call) => (
                    <tr
                      key={call.id}
                      className="hover:bg-gray-800/30 transition cursor-pointer"
                      onClick={() => router.push(`/calls/${call.id}`)}
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
                        <div className="flex items-center gap-2 text-sm text-white">
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
                        <span className="text-sm text-gray-300">
                          {formatDuration(call.duration_sec)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          call.direction === 'inbound'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {call.direction || 'unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          call.disposition === 'completed'
                            ? 'bg-green-500/20 text-green-400'
                            : call.disposition === 'missed'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {call.disposition || 'unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}