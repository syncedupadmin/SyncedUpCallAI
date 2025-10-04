'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Search, Filter, ChevronDown, ChevronUp, Download, FileText } from 'lucide-react';

interface ComplianceResult {
  id: string;
  call_id: string;
  agent_name: string;
  overall_score: number;
  compliance_passed: boolean;
  analyzed_at: string;
  paraphrased_sections: Array<{
    original: string;
    spoken: string;
    score: number;
    matched: boolean;
  }>;
  missing_phrases: string[];
  script_name: string;
  script_version: string;
}

export default function ResultsPage() {
  const [results, setResults] = useState<ComplianceResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<ComplianceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'passed' | 'failed'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadResults();
  }, []);

  useEffect(() => {
    filterResults();
  }, [results, searchQuery, filterStatus]);

  const loadResults = async () => {
    try {
      const res = await fetch('/api/admin/post-close');
      const data = await res.json();
      setResults(data.results || []);
    } catch (error) {
      console.error('Failed to load results:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterResults = () => {
    let filtered = [...results];

    // Apply status filter
    if (filterStatus === 'passed') {
      filtered = filtered.filter(r => r.compliance_passed);
    } else if (filterStatus === 'failed') {
      filtered = filtered.filter(r => !r.compliance_passed);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.agent_name?.toLowerCase().includes(query) ||
        r.call_id?.toLowerCase().includes(query)
      );
    }

    setFilteredResults(filtered);
  };

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const exportToCSV = () => {
    const headers = ['Agent Name', 'Call ID', 'Score', 'Status', 'Analyzed At', 'Script Name', 'Missing Phrases'];

    const csvData = filteredResults.map(r => [
      r.agent_name,
      r.call_id,
      r.overall_score.toFixed(2),
      r.compliance_passed ? 'Passed' : 'Failed',
      new Date(r.analyzed_at).toLocaleString(),
      r.script_name,
      r.missing_phrases.join('; ')
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `compliance_results_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportToJSON = () => {
    const jsonContent = JSON.stringify(filteredResults, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `compliance_results_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading results...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Compliance Results</h1>
        <p className="text-gray-400 mt-1">All post-close verification results</p>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search by agent name or call ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-900 text-white pl-10 pr-4 py-2 rounded-lg border border-gray-700 focus:border-cyan-500 outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'passed' | 'failed')}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-cyan-500 outline-none"
            >
              <option value="all">All Results</option>
              <option value="passed">Passed Only</option>
              <option value="failed">Failed Only</option>
            </select>
          </div>

          {/* Export Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={exportToCSV}
              disabled={filteredResults.length === 0}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={exportToJSON}
              disabled={filteredResults.length === 0}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-400">
          Showing {filteredResults.length} of {results.length} results
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {filteredResults.length > 0 ? filteredResults.map((result) => (
          <div key={result.id} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            {/* Summary Row */}
            <button
              onClick={() => toggleExpanded(result.id)}
              className="w-full p-6 flex items-center justify-between hover:bg-gray-750 transition-colors text-left"
            >
              <div className="flex-1 flex items-center gap-6">
                {/* Status Icon */}
                <div>
                  {result.compliance_passed ? (
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  ) : (
                    <XCircle className="w-8 h-8 text-red-500" />
                  )}
                </div>

                {/* Agent Info */}
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">{result.agent_name || 'Unknown Agent'}</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {new Date(result.analyzed_at).toLocaleString()} • Call ID: {result.call_id}
                  </p>
                </div>

                {/* Score */}
                <div className="text-right">
                  <p className={`text-3xl font-bold ${
                    result.compliance_passed ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {Math.round(result.overall_score)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {result.script_name || 'Unknown Script'}
                  </p>
                </div>

                {/* Expand Icon */}
                <div>
                  {expandedId === result.id ? (
                    <ChevronUp className="w-6 h-6 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-6 h-6 text-gray-400" />
                  )}
                </div>
              </div>
            </button>

            {/* Expanded Details */}
            {expandedId === result.id && (
              <div className="border-t border-gray-700 p-6 bg-gray-900/50">
                {/* Missing Phrases */}
                {result.missing_phrases && result.missing_phrases.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-lg font-bold text-red-400 mb-3 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      Missing Required Phrases ({result.missing_phrases.length})
                    </h4>
                    <div className="space-y-2">
                      {result.missing_phrases.map((phrase, idx) => (
                        <div key={idx} className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                          <p className="text-sm text-red-300">{phrase}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Paraphrased Sections */}
                {result.paraphrased_sections && result.paraphrased_sections.length > 0 && (
                  <div>
                    <h4 className="text-lg font-bold text-white mb-3">
                      Phrase Analysis ({result.paraphrased_sections.length})
                    </h4>
                    <div className="space-y-3">
                      {result.paraphrased_sections.map((section, idx) => (
                        <div
                          key={idx}
                          className={`rounded-lg p-4 border ${
                            section.matched
                              ? 'bg-green-500/10 border-green-500/30'
                              : 'bg-red-500/10 border-red-500/30'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-xs font-bold text-gray-400">REQUIRED</p>
                            <span className={`text-sm font-bold ${
                              section.matched ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {Math.round(section.score)}% match
                            </span>
                          </div>
                          <p className="text-sm text-gray-300 mb-3">{section.original}</p>

                          <div className="border-t border-gray-700 pt-3">
                            <p className="text-xs font-bold text-gray-400 mb-1">AGENT SPOKE</p>
                            <p className={`text-sm ${
                              section.matched ? 'text-green-300' : 'text-red-300'
                            }`}>
                              {section.spoken || 'Not found in transcript'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Script Info */}
                <div className="mt-6 pt-6 border-t border-gray-700">
                  <div className="flex items-center justify-between text-sm text-gray-400">
                    <span>Script: {result.script_name} v{result.script_version}</span>
                    <span>Analyzed: {new Date(result.analyzed_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )) : (
          <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
            <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No results found</p>
            <p className="text-sm text-gray-500 mt-1">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
