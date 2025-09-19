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
  Filter,
  FileText,
  Mic,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  MessageSquare
} from 'lucide-react';

interface ProcessedCall {
  id: string;
  source: string;
  campaign: string;
  disposition: string;
  direction: string;
  started_at: string;
  duration_sec: number;
  recording_url: string;
  agent_name?: string;
  phone_number?: string;
  // Processing fields
  transcript?: {
    text: string;
    lang: string;
    engine: string;
  };
  analysis?: {
    summary: string;
    qa_score: number;
    script_adherence: number;
    sentiment_agent: number;
    sentiment_customer: number;
    reason_primary: string;
  };
  processing_status?: 'pending' | 'transcribed' | 'analyzed' | 'failed';
}

export default function ProcessedCallsPage() {
  const [calls, setCalls] = useState<ProcessedCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'transcribed' | 'analyzed' | 'failed'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const router = useRouter();

  useEffect(() => {
    fetchProcessedCalls();
    const interval = setInterval(() => {
      fetchProcessedCalls(true);
    }, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchProcessedCalls = async (isAutoRefresh = false) => {
    try {
      if (isAutoRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Fetch calls with transcripts/analysis
      const response = await fetch('/api/ui/library');
      const data = await response.json();

      if (data.ok || data.data) {
        // Process and enrich the data
        const processedCalls = (data.data || []).map((call: any) => ({
          ...call,
          processing_status: call.analysis ? 'analyzed' :
                           call.transcript ? 'transcribed' :
                           'pending'
        }));

        setCalls(processedCalls);
      }
    } catch (error) {
      console.error('Error fetching processed calls:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
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

    // Text search
    if (searchTerm) {
      filtered = filtered.filter(call =>
        call.phone_number?.includes(searchTerm) ||
        call.agent_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        call.campaign?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        call.transcript?.text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        call.analysis?.summary?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Processing status filter
    if (filter !== 'all') {
      filtered = filtered.filter(call => call.processing_status === filter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      filtered = filtered.filter(call => {
        const callDate = new Date(call.started_at);
        if (dateFilter === 'today') return callDate >= today;
        if (dateFilter === 'week') return callDate >= weekAgo;
        if (dateFilter === 'month') return callDate >= monthAgo;
        return true;
      });
    }

    return filtered;
  };

  const filteredCalls = getFilteredCalls();

  // Calculate stats
  const stats = {
    total: filteredCalls.length,
    transcribed: filteredCalls.filter(c => c.processing_status === 'transcribed').length,
    analyzed: filteredCalls.filter(c => c.processing_status === 'analyzed').length,
    avgQAScore: filteredCalls
      .filter(c => c.analysis?.qa_score)
      .reduce((sum, c) => sum + (c.analysis?.qa_score || 0), 0) /
      (filteredCalls.filter(c => c.analysis?.qa_score).length || 1)
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getSentimentEmoji = (sentiment: number) => {
    if (sentiment > 0.3) return '😊';
    if (sentiment < -0.3) return '😔';
    return '😐';
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
          <span className="ml-3 text-gray-300">Loading processed calls...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
          Processed Calls
        </h1>
        <p className="text-gray-400">View and analyze transcribed and analyzed calls</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Processed</div>
          <div className="text-2xl font-bold text-cyan-400">{stats.total}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Transcribed</div>
          <div className="text-2xl font-bold text-blue-400">{stats.transcribed}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Analyzed</div>
          <div className="text-2xl font-bold text-green-400">{stats.analyzed}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Avg QA Score</div>
          <div className={`text-2xl font-bold ${getScoreColor(stats.avgQAScore)}`}>
            {stats.avgQAScore.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search by phone, agent, campaign, or content..."
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
            {(['all', 'transcribed', 'analyzed'] as const).map((filterOption) => (
              <button
                key={filterOption}
                onClick={() => setFilter(filterOption as any)}
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
            onClick={() => fetchProcessedCalls(false)}
            disabled={loading || refreshing}
            className="px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 rounded-lg text-gray-300 hover:text-white transition flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Processed Calls Grid */}
      <div className="grid gap-4">
        {filteredCalls.length === 0 ? (
          <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-8 text-center">
            <p className="text-gray-400">No processed calls found matching filters</p>
          </div>
        ) : (
          filteredCalls.map((call) => (
            <div
              key={call.id}
              className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-6 hover:border-cyan-500/50 transition cursor-pointer"
              onClick={() => router.push(`/calls/${call.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-cyan-500/10 rounded-lg">
                    <Phone className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-medium text-white">{call.phone_number || 'Unknown'}</span>
                      <span className="text-sm text-gray-500">•</span>
                      <span className="text-sm text-gray-400">{call.agent_name || 'Unknown Agent'}</span>
                      <span className="text-sm text-gray-500">•</span>
                      <span className="text-sm text-gray-400">{formatDuration(call.duration_sec)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(call.started_at), 'MMM dd, yyyy')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(call.started_at), 'HH:mm')}
                      </span>
                      <span>{call.campaign}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {call.processing_status === 'analyzed' && (
                    <div className="px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-sm flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Analyzed
                    </div>
                  )}
                  {call.processing_status === 'transcribed' && (
                    <div className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-sm flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      Transcribed
                    </div>
                  )}
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </div>
              </div>

              {/* Analysis Summary if available */}
              {call.analysis && (
                <div className="bg-gray-800/30 rounded-lg p-4 mb-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="text-sm text-gray-300 line-clamp-2">{call.analysis.summary}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-500">QA:</span>
                      <span className={getScoreColor(call.analysis.qa_score)}>
                        {call.analysis.qa_score}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-500">Script:</span>
                      <span className={getScoreColor(call.analysis.script_adherence)}>
                        {call.analysis.script_adherence}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Agent:</span>
                      <span>{getSentimentEmoji(call.analysis.sentiment_agent)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Customer:</span>
                      <span>{getSentimentEmoji(call.analysis.sentiment_customer)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Transcript Preview if available */}
              {call.transcript && (
                <div className="bg-gray-800/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Mic className="w-4 h-4 text-gray-500" />
                    <span className="text-xs text-gray-500 uppercase">
                      Transcript ({call.transcript.lang}) • {call.transcript.engine}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 line-clamp-3">
                    {call.transcript.text}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}