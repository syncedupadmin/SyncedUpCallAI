'use client';

import { useState, useEffect } from 'react';
import {
  Shield,
  CheckCircle,
  AlertCircle,
  Upload,
  Play,
  BarChart3,
  FileText,
  Target,
  TrendingUp,
  Activity,
  Zap,
  XCircle
} from 'lucide-react';

interface Script {
  id: string;
  script_name: string;
  script_version: string;
  product_type?: string;
  state?: string;
  script_text: string;
  required_phrases: string[];
  optional_phrases: string[];
  active: boolean;
  status: string;
  min_word_match_percentage: number;
  strict_mode?: boolean;
  created_at: string;
  updated_at: string;
  activated_at?: string;
}

interface ComplianceResult {
  id: string;
  overall_score: number;
  compliance_passed: boolean;
  word_match_percentage: number;
  phrase_match_percentage: number;
  missing_phrases: string[];
  paraphrased_sections: any[];
  flagged_for_review: boolean;
  flag_reasons: string[];
  agent_name: string;
  script_name: string;
  transcript: string;
  analyzed_at: string;
}

interface AgentPerformance {
  agent_name: string;
  total_analyzed: number;
  total_passed: number;
  total_failed: number;
  avg_compliance_score: number;
  avg_word_match: number;
  avg_phrase_match: number;
  violations_count: number;
  pass_rate: number;
}

export default function PostClosePage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [results, setResults] = useState<ComplianceResult[]>([]);
  const [agents, setAgents] = useState<AgentPerformance[]>([]);
  const [stats, setStats] = useState<any>({});
  const [activeTab, setActiveTab] = useState<'overview' | 'scripts' | 'agents' | 'test'>('overview');
  const [processing, setProcessing] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ComplianceResult | null>(null);

  // Script upload state
  const [scriptName, setScriptName] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [productType, setProductType] = useState('');
  const [uploadMethod, setUploadMethod] = useState<'paste' | 'file'>('paste');

  // Test state
  const [testTranscript, setTestTranscript] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([
      loadScripts(),
      loadResults(),
      loadAgents(),
      loadStats()
    ]);
  };

  const loadScripts = async () => {
    try {
      const res = await fetch('/api/admin/post-close/scripts');
      const data = await res.json();
      if (data.scripts) {
        setScripts(data.scripts);
      }
    } catch (error) {
      console.error('Failed to load scripts:', error);
    }
  };

  const loadResults = async () => {
    try {
      const res = await fetch('/api/admin/post-close');
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
      }
    } catch (error) {
      console.error('Failed to load results:', error);
    }
  };

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/admin/post-close/agents');
      const data = await res.json();
      if (data.agents) {
        setAgents(data.agents);
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch('/api/admin/post-close/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const extractFromRecentCalls = async () => {
    setProcessing(true);
    try {
      const res = await fetch('/api/admin/post-close/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 })
      });
      const result = await res.json();

      alert(`Extracted ${result.extracted} post-close segments from recent sales`);
      await loadData();
    } catch (error) {
      console.error('Extraction failed:', error);
      alert('Failed to extract segments');
    } finally {
      setProcessing(false);
    }
  };

  const uploadScript = async () => {
    if (!scriptName || !scriptText) {
      alert('Please provide script name and text');
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch('/api/admin/post-close/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script_name: scriptName,
          script_text: scriptText,
          product_type: productType || null
        })
      });

      const result = await res.json();

      if (result.success) {
        alert('Script uploaded successfully!');
        setScriptName('');
        setScriptText('');
        setProductType('');
        await loadScripts();
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload script');
    } finally {
      setProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setScriptText(text);
      setScriptName(file.name.replace(/\.[^/.]+$/, '')); // Remove extension
    };
    reader.readAsText(file);
  };

  const activateScript = async (scriptId: string) => {
    if (!confirm('Activate this script? It will be used for all future compliance checks.')) {
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch('/api/admin/post-close/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate', script_id: scriptId })
      });

      const result = await res.json();

      if (result.success) {
        alert('Script activated successfully!');
        await loadScripts();
      }
    } catch (error) {
      console.error('Activation failed:', error);
      alert('Failed to activate script');
    } finally {
      setProcessing(false);
    }
  };

  const deleteScript = async (scriptId: string) => {
    if (!confirm('Delete this script? This cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/post-close/scripts?id=${scriptId}`, {
        method: 'DELETE'
      });

      const result = await res.json();

      if (result.success) {
        alert('Script deleted successfully');
        await loadScripts();
      } else {
        alert(result.error || 'Failed to delete script');
      }
    } catch (error) {
      console.error('Deletion failed:', error);
      alert('Failed to delete script');
    }
  };

  const toggleStrictMode = async (scriptId: string, currentValue: boolean) => {
    setProcessing(true);
    try {
      const res = await fetch('/api/admin/post-close/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_strict_mode',
          script_id: scriptId,
          strict_mode: !currentValue
        })
      });

      const result = await res.json();

      if (result.success) {
        await loadScripts();
      } else {
        alert(result.error || 'Failed to toggle strict mode');
      }
    } catch (error) {
      console.error('Toggle failed:', error);
      alert('Failed to toggle strict mode');
    } finally {
      setProcessing(false);
    }
  };

  const testCompliance = async () => {
    if (!testTranscript) {
      alert('Please paste a transcript to test');
      return;
    }

    setTesting(true);
    try {
      const res = await fetch('/api/admin/post-close/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: testTranscript })
      });

      const result = await res.json();

      if (result.success !== false) {
        setTestResult(result);
      } else {
        alert(result.error || 'Test failed');
      }
    } catch (error) {
      console.error('Test failed:', error);
      alert('Failed to test compliance');
    } finally {
      setTesting(false);
    }
  };

  const formatPercentage = (value: number | null): string => {
    if (value === null || value === undefined) return '0%';
    return `${Math.round(value)}%`;
  };

  const formatNumber = (value: number | null): string => {
    if (value === null || value === undefined) return '0';
    return Math.round(value).toString();
  };

  const activeScript = scripts.find(s => s.active);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <Shield className="w-10 h-10 text-green-500" />
            Post-Close Compliance System
          </h1>
          <p className="text-gray-400">Verify agents read required terms & conditions scripts verbatim</p>
        </div>

        {/* Hero Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-br from-green-900/50 to-emerald-900/50 rounded-xl p-6 border border-green-800">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <span className="text-xs text-green-400">Avg Score</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {formatNumber(stats.avg_compliance_score)}
            </div>
            <div className="text-xs text-gray-400 mt-1">Compliance score (0-100)</div>
          </div>

          <div className="bg-gradient-to-br from-blue-900/50 to-indigo-900/50 rounded-xl p-6 border border-blue-800">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-6 h-6 text-blue-400" />
              <span className="text-xs text-blue-400">Pass Rate</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {formatPercentage((stats.pass_rate || 0) * 100)}
            </div>
            <div className="text-xs text-gray-400 mt-1">Calls passing compliance</div>
          </div>

          <div className="bg-gradient-to-br from-orange-900/50 to-red-900/50 rounded-xl p-6 border border-orange-800">
            <div className="flex items-center justify-between mb-2">
              <AlertCircle className="w-6 h-6 text-orange-400" />
              <span className="text-xs text-orange-400">Flagged</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {formatNumber(stats.flagged_count)}
            </div>
            <div className="text-xs text-gray-400 mt-1">Flagged for review</div>
          </div>

          <div className="bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-xl p-6 border border-purple-800">
            <div className="flex items-center justify-between mb-2">
              <FileText className="w-6 h-6 text-purple-400" />
              <span className="text-xs text-purple-400">Active Scripts</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {formatNumber(stats.active_scripts)}
            </div>
            <div className="text-xs text-gray-400 mt-1">Scripts in use</div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={extractFromRecentCalls}
            disabled={processing}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'Analyze Recent Sales Calls'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900 rounded-lg p-1">
          {['overview', 'scripts', 'agents', 'test'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`flex-1 px-4 py-2 rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-green-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Recent Compliance Results */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-400" />
                Recent Compliance Checks
              </h2>

              <div className="space-y-4">
                {results.slice(0, 10).map((result) => (
                  <div
                    key={result.id}
                    className="bg-gray-800/50 rounded-lg p-4 cursor-pointer hover:bg-gray-800 transition-colors"
                    onClick={() => setSelectedResult(result)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{result.agent_name}</span>
                          <span className="text-xs text-gray-500">
                            Score: {formatNumber(result.overall_score)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 line-clamp-2">
                          {result.transcript?.substring(0, 150)}...
                        </p>
                      </div>
                      <div className="ml-4">
                        {result.compliance_passed ? (
                          <CheckCircle className="w-6 h-6 text-green-500" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500" />
                        )}
                      </div>
                    </div>

                    <div className="flex gap-4 text-xs">
                      <span className={result.compliance_passed ? 'text-green-500' : 'text-red-500'}>
                        {result.compliance_passed ? 'PASSED' : 'FAILED'}
                      </span>
                      <span className="text-gray-500">
                        Word Match: {formatPercentage(result.word_match_percentage)}
                      </span>
                      <span className="text-gray-500">
                        Phrase Match: {formatPercentage(result.phrase_match_percentage)}
                      </span>
                      {result.missing_phrases?.length > 0 && (
                        <span className="text-orange-500">
                          {result.missing_phrases.length} missing phrases
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {results.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No compliance checks yet. Click "Analyze Recent Sales Calls" to start.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'scripts' && (
          <div className="space-y-6">
            {/* Upload Script */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-400" />
                Upload Post-Close Script
              </h2>

              <div className="space-y-4">
                {/* Upload Method Toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setUploadMethod('paste')}
                    className={`px-4 py-2 rounded ${
                      uploadMethod === 'paste'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    Paste Text
                  </button>
                  <button
                    onClick={() => setUploadMethod('file')}
                    className={`px-4 py-2 rounded ${
                      uploadMethod === 'file'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    Upload File
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Script Name (e.g., 'Medicare Post-Close v1.0')"
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                  className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-700"
                />

                <input
                  type="text"
                  placeholder="Product Type (optional, e.g., 'Medicare', 'Supplement')"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-700"
                />

                {uploadMethod === 'paste' ? (
                  <textarea
                    placeholder="Paste the complete post-close script here..."
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    className="w-full bg-gray-800 text-white p-4 rounded-lg border border-gray-700 font-mono text-sm"
                    rows={12}
                  />
                ) : (
                  <div>
                    <input
                      type="file"
                      accept=".txt,.doc,.docx"
                      onChange={handleFileUpload}
                      className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-700"
                    />
                    {scriptText && (
                      <div className="mt-2 p-3 bg-gray-800 rounded text-xs">
                        <div className="text-gray-400">Preview:</div>
                        <div className="mt-1 text-white font-mono">
                          {scriptText.substring(0, 200)}...
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={uploadScript}
                  disabled={processing || !scriptName || !scriptText}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
                >
                  {processing ? 'Uploading...' : 'Upload Script'}
                </button>
              </div>
            </div>

            {/* Existing Scripts */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Uploaded Scripts
              </h2>

              {scripts.length > 0 ? (
                <div className="space-y-4">
                  {scripts.map((script) => (
                    <div
                      key={script.id}
                      className={`bg-gray-800/50 rounded-lg p-4 border ${
                        script.active ? 'border-green-500' : 'border-gray-700'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-lg">{script.script_name}</h3>
                            {script.active && (
                              <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                                ACTIVE
                              </span>
                            )}
                            {script.strict_mode && (
                              <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded flex items-center gap-1">
                                <Shield className="w-3 h-3" />
                                STRICT MODE
                              </span>
                            )}
                            <span className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded">
                              v{script.script_version}
                            </span>
                          </div>
                          {script.product_type && (
                            <p className="text-sm text-gray-400 mt-1">
                              Product: {script.product_type}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {!script.active && (
                            <button
                              onClick={() => activateScript(script.id)}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
                            >
                              Activate
                            </button>
                          )}
                          <button
                            onClick={() => deleteScript(script.id)}
                            disabled={script.active}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mb-3 p-3 bg-gray-900 rounded text-sm font-mono">
                        {script.script_text.substring(0, 200)}
                        {script.script_text.length > 200 && '...'}
                      </div>

                      {/* Strict Mode Toggle */}
                      <div className="mb-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="font-medium text-white flex items-center gap-2 text-sm">
                              <Shield className="w-4 h-4 text-red-400" />
                              Strict Word-for-Word Mode
                            </label>
                            <p className="text-xs text-gray-400 mt-1">
                              {script.strict_mode
                                ? '100% exact matching - no paraphrasing (98% min score)'
                                : '80% fuzzy matching - allows paraphrasing'}
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={script.strict_mode || false}
                              onChange={() => toggleStrictMode(script.id, script.strict_mode || false)}
                              disabled={processing}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Required Phrases:</span>
                          <span className="ml-2 text-white">
                            {script.required_phrases?.length || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Min Score:</span>
                          <span className="ml-2 text-white">
                            {script.strict_mode ? '98%' : `${script.min_word_match_percentage}%`}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Created:</span>
                          <span className="ml-2 text-white">
                            {new Date(script.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No scripts uploaded yet. Upload your first post-close script above.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="space-y-6">
            {/* Agent Performance */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Agent Compliance Performance
              </h2>

              {agents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                        <th className="pb-3">Agent</th>
                        <th className="pb-3">Total Analyzed</th>
                        <th className="pb-3">Passed</th>
                        <th className="pb-3">Failed</th>
                        <th className="pb-3">Avg Score</th>
                        <th className="pb-3">Pass Rate</th>
                        <th className="pb-3">Violations</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {agents.map((agent) => (
                        <tr key={agent.agent_name} className="border-b border-gray-800/50">
                          <td className="py-3 font-medium">{agent.agent_name}</td>
                          <td className="py-3">{agent.total_analyzed}</td>
                          <td className="py-3 text-green-500">{agent.total_passed}</td>
                          <td className="py-3 text-red-500">{agent.total_failed}</td>
                          <td className="py-3">
                            <span className={`font-bold ${
                              agent.avg_compliance_score >= 90 ? 'text-green-500' :
                              agent.avg_compliance_score >= 70 ? 'text-yellow-500' :
                              'text-red-500'
                            }`}>
                              {formatNumber(agent.avg_compliance_score)}
                            </span>
                          </td>
                          <td className="py-3">
                            <span className={`font-bold ${
                              agent.pass_rate >= 90 ? 'text-green-500' :
                              agent.pass_rate >= 70 ? 'text-yellow-500' :
                              'text-red-500'
                            }`}>
                              {formatPercentage(agent.pass_rate)}
                            </span>
                          </td>
                          <td className="py-3">
                            <span className={agent.violations_count > 5 ? 'text-red-500' : 'text-gray-400'}>
                              {agent.violations_count}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No agent performance data available. Analyze some calls to see agent metrics.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'test' && (
          <div className="space-y-6">
            {/* Test Compliance */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h2 className="text-xl font-bold mb-4">Test Compliance</h2>

              {activeScript ? (
                <div className="grid grid-cols-2 gap-6">
                  {/* Left: Script */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">
                      Active Script: {activeScript.script_name}
                    </h3>
                    <div className="bg-gray-800 p-4 rounded-lg h-96 overflow-y-auto font-mono text-sm">
                      {activeScript.script_text}
                    </div>
                  </div>

                  {/* Right: Test Input */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">
                      Paste Transcript to Test
                    </h3>
                    <textarea
                      value={testTranscript}
                      onChange={(e) => setTestTranscript(e.target.value)}
                      className="w-full bg-gray-800 text-white p-4 rounded-lg border border-gray-700 font-mono text-sm h-64"
                      placeholder="Paste the agent's post-close transcript here..."
                    />

                    <button
                      onClick={testCompliance}
                      disabled={testing || !testTranscript}
                      className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {testing ? 'Analyzing...' : 'Test Compliance'}
                    </button>

                    {/* Test Results */}
                    {testResult && (
                      <div className="mt-4 p-4 bg-gray-800 rounded-lg">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-lg font-bold">Compliance Score</span>
                          <span className={`text-3xl font-bold ${
                            testResult.compliance_passed ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {formatNumber(testResult.overall_score)}
                          </span>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Word Match:</span>
                            <span>{formatPercentage(testResult.word_match_percentage)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Phrase Match:</span>
                            <span>{formatPercentage(testResult.phrase_match_percentage)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Status:</span>
                            <span className={testResult.compliance_passed ? 'text-green-500' : 'text-red-500'}>
                              {testResult.compliance_passed ? 'PASSED' : 'FAILED'}
                            </span>
                          </div>

                          {testResult.missing_phrases?.length > 0 && (
                            <div className="mt-4">
                              <div className="text-red-400 font-medium mb-2">Missing Phrases:</div>
                              <ul className="list-disc list-inside text-xs space-y-1">
                                {testResult.missing_phrases.slice(0, 5).map((phrase: string, i: number) => (
                                  <li key={i} className="text-gray-400">{phrase}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {testResult.flag_reasons?.length > 0 && (
                            <div className="mt-4">
                              <div className="text-orange-400 font-medium mb-2">Issues:</div>
                              <ul className="list-disc list-inside text-xs space-y-1">
                                {testResult.flag_reasons.map((reason: string, i: number) => (
                                  <li key={i} className="text-gray-400">{reason}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                  <p>No active script found.</p>
                  <p className="text-sm mt-2">Upload and activate a script in the Scripts tab first.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {selectedResult && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedResult(null)}
          >
            <div
              className="bg-gray-900 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold mb-4">Compliance Detail</h3>

              <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                  <label className="text-sm text-gray-500">Agent</label>
                  <p className="text-white">{selectedResult.agent_name}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Overall Score</label>
                  <p className={`text-2xl font-bold ${
                    selectedResult.compliance_passed ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {formatNumber(selectedResult.overall_score)}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Word Match</label>
                  <p className="text-white">{formatPercentage(selectedResult.word_match_percentage)}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Phrase Match</label>
                  <p className="text-white">{formatPercentage(selectedResult.phrase_match_percentage)}</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-sm text-gray-500">Transcript</label>
                <div className="bg-gray-800 p-4 rounded mt-1 max-h-48 overflow-y-auto font-mono text-sm">
                  {selectedResult.transcript}
                </div>
              </div>

              {selectedResult.missing_phrases?.length > 0 && (
                <div className="mb-4">
                  <label className="text-sm text-red-400">Missing Required Phrases</label>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                    {selectedResult.missing_phrases.map((phrase, i) => (
                      <li key={i} className="text-gray-300">
                        {typeof phrase === 'string' ? phrase : JSON.stringify(phrase)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedResult.paraphrased_sections?.length > 0 && (
                <div className="mb-4">
                  <label className="text-sm text-blue-400">Paraphrased Sections</label>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                    {selectedResult.paraphrased_sections.map((section: any, i: number) => (
                      <li key={i} className="text-gray-300">
                        <span className="text-gray-500">Original:</span> {section.original || 'N/A'}
                        {' → '}
                        <span className="text-gray-500">Actual:</span> {section.actual || 'N/A'}
                        {section.similarity && (
                          <span className="text-gray-600 ml-2">({Math.round(section.similarity * 100)}% match)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedResult.flag_reasons?.length > 0 && (
                <div className="mb-4">
                  <label className="text-sm text-orange-400">Flag Reasons</label>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                    {selectedResult.flag_reasons.map((reason, i) => (
                      <li key={i} className="text-gray-300">
                        {typeof reason === 'string' ? reason : JSON.stringify(reason)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={() => setSelectedResult(null)}
                className="mt-6 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
