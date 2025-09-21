'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { UserNav } from '@/components/UserNav';
import { useAgencyContext, useCurrentAgency } from '@/contexts/AgencyContext';
import {
  Phone,
  Clock,
  Calendar,
  User,
  Search,
  Filter,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';

interface Call {
  id: string;
  customer_phone: string;
  agent_name: string;
  duration: number;
  created_at: string;
  status: string;
  qa_score?: number;
}

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const PAGE_SIZE = 25;
  const supabase = createClient();
  const router = useRouter();
  const { selectedAgencyId, loading: agencyLoading } = useAgencyContext();
  const currentAgency = useCurrentAgency();

  useEffect(() => {
    // Check authentication
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login');
      }
    });
  }, []);

  useEffect(() => {
    if (selectedAgencyId && !agencyLoading) {
      fetchCalls();
    }
  }, [selectedAgencyId, agencyLoading, currentPage]);

  const fetchCalls = async () => {
    if (!selectedAgencyId) return;

    try {
      setLoading(true);
      setError(null);

      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('calls')
        .select('*', { count: 'exact' })
        .eq('agency_id', selectedAgencyId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (searchTerm) {
        query = query.or(`customer_phone.ilike.%${searchTerm}%,agent_name.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      setCalls(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Error fetching calls:', err);
      setError(err instanceof Error ? err.message : 'Failed to load calls');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const filteredCalls = searchTerm
    ? calls.filter(call =>
        call.customer_phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        call.agent_name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : calls;

  const handleSearch = () => {
    setCurrentPage(1);
    fetchCalls();
  };

  if (agencyLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-900">
      <UserNav currentPath="/calls" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <Phone className="h-8 w-8" />
            Calls
          </h1>
          <p className="text-gray-400">
            {currentAgency
              ? `Viewing calls for ${currentAgency.agency_name}`
              : 'View and manage call records'
            }
          </p>
        </div>

        {/* Search and filters */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Search calls
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by phone number or agent name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Search className="h-4 w-4" />
                Search
              </button>
              <button
                onClick={fetchCalls}
                disabled={loading}
                className="p-2 text-gray-400 hover:bg-gray-700 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Calls table */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          {error ? (
            <div className="p-8 text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={fetchCalls}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500 mx-auto"></div>
              <p className="text-gray-400 mt-4">Loading calls...</p>
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="p-8 text-center">
              <Phone className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-2">
                {searchTerm ? 'No calls found matching your search' : 'No calls recorded yet'}
              </p>
              <p className="text-gray-500 text-sm">
                {!searchTerm && 'Calls will appear here once they\'re processed'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900 border-b border-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Phone Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Agent
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Duration
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        QA Score
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredCalls.map((call) => (
                      <tr key={call.id} className="hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">
                          {call.customer_phone || '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-300">
                          {call.agent_name || '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-300">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4 text-gray-500" />
                            {formatDuration(call.duration || 0)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-400 text-sm">
                          {formatDate(call.created_at)}
                        </td>
                        <td className="px-6 py-4">
                          {call.qa_score ? (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              call.qa_score >= 80
                                ? 'bg-green-900/30 text-green-400 border border-green-700'
                                : call.qa_score >= 60
                                ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-700'
                                : 'bg-red-900/30 text-red-400 border border-red-700'
                            }`}>
                              {call.qa_score}%
                            </span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/calls/${call.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1 text-sm bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-colors"
                          >
                            View
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-gray-700">
                  <div className="text-sm text-gray-400">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
                    {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} calls
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>
                    <span className="px-3 py-1 text-sm text-gray-400">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}