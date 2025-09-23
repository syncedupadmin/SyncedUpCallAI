'use client';

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  Search,
  RefreshCw,
  Trash2,
  Play,
  Save,
  RotateCcw,
  Zap,
  AlertCircle,
  ChevronRight,
  Activity,
  TrendingDown,
  TrendingUp,
  FileText,
  Package,
  Clock
} from 'lucide-react';

interface Config {
  id: string;
  name: string;
  config: any;
  is_active: boolean;
  accuracy_score: number;
  word_error_rate: number;
  keywords_count: number;
  replacements_count: number;
}

interface Analysis {
  totalKeywords: number;
  totalReplacements: number;
  addedSinceDefault: number;
  accuracyChange: number;
  accuracyScore: number;
  problematicKeywords: any[];
  recommendedRemovals: string[];
  overtuningStatus: 'optimal' | 'medium' | 'high' | 'critical';
  message: string;
}

export default function AISettingsDashboard() {
  const [currentConfig, setCurrentConfig] = useState<Config | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'keywords' | 'test' | 'configs'>('overview');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Load current configuration and analysis on mount
  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/ai-config/current');
      const data = await res.json();

      if (data.config && data.analysis) {
        setCurrentConfig(data.config);
        setAnalysis(data.analysis);
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFix = async () => {
    if (!analysis?.recommendedRemovals || analysis.recommendedRemovals.length === 0) {
      alert('No problematic keywords identified');
      return;
    }

    if (!confirm(`Remove ${analysis.recommendedRemovals.length} problematic keywords?`)) {
      return;
    }

    try {
      // Create new config without problematic keywords
      const newKeywords = currentConfig?.config.keywords.filter(
        (k: string) => !analysis.recommendedRemovals.includes(k.split(':')[0])
      );

      const newConfig = {
        ...currentConfig?.config,
        keywords: newKeywords
      };

      // Save new configuration
      const saveRes = await fetch('/api/ai-config/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Quick Fix - ${new Date().toLocaleString()}`,
          description: `Removed ${analysis.recommendedRemovals.length} problematic keywords`,
          config: newConfig
        })
      });

      const saveData = await saveRes.json();

      if (saveData.success) {
        alert(`Configuration saved. ID: ${saveData.configId}. Test before activating.`);
        await loadCurrentConfig();
      }
    } catch (error) {
      console.error('Quick fix failed:', error);
      alert('Failed to apply quick fix');
    }
  };

  const handleRollback = async (target: string = 'factory') => {
    if (!confirm(`Rollback to ${target === 'factory' ? 'factory defaults' : 'previous configuration'}?`)) {
      return;
    }

    try {
      const res = await fetch('/api/ai-config/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });

      const data = await res.json();

      if (data.success) {
        alert(data.message);
        await loadCurrentConfig();
      } else {
        alert(data.error || 'Rollback failed');
      }
    } catch (error) {
      console.error('Rollback failed:', error);
      alert('Failed to rollback configuration');
    }
  };

  const handleTestConfig = async () => {
    setIsTesting(true);
    try {
      // Use a sample audio URL for testing
      const testAudioUrl = prompt('Enter audio URL to test:');
      const expectedText = prompt('Enter expected transcription (optional):');

      if (!testAudioUrl) {
        return;
      }

      const res = await fetch('/api/ai-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioUrl: testAudioUrl,
          expectedText,
          testConfig: currentConfig?.config,
          compareWithActive: false
        })
      });

      const data = await res.json();
      setTestResults(data);
    } catch (error) {
      console.error('Test failed:', error);
      alert('Test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'optimal': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'critical': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Configuration Center</h1>
              <p className="text-sm text-gray-500 mt-1">Manage Deepgram transcription settings</p>
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-sm text-gray-500">Current Accuracy</p>
                <p className={`text-2xl font-bold ${
                  analysis?.accuracyScore && analysis.accuracyScore < 70 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {analysis?.accuracyScore ? Number(analysis.accuracyScore).toFixed(0) : 0}%
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">Keywords</p>
                <p className={`text-2xl font-bold ${
                  analysis?.totalKeywords && analysis.totalKeywords > 20 ? 'text-red-600' : 'text-gray-900'
                }`}>
                  {analysis?.totalKeywords || 0}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500">Status</p>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(analysis?.overtuningStatus || 'optimal')}`}>
                  {analysis?.overtuningStatus || 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Warning Banner */}
        {analysis?.overtuningStatus === 'critical' && (
          <div className="bg-red-50 border-t border-red-200 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span className="text-red-800 font-medium">{analysis.message}</span>
              </div>
              <button
                onClick={handleQuickFix}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Quick Fix: Remove Top {analysis.recommendedRemovals?.length || 10} Problem Keywords
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="px-6">
          <nav className="flex space-x-8">
            {['overview', 'keywords', 'test', 'configs'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Over-tuning Analysis */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Over-Tuning Analysis</h2>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Keywords Added</p>
                  <p className={`text-2xl font-bold ${
                    analysis?.totalKeywords && analysis.totalKeywords > 20 ? 'text-red-600' : 'text-gray-900'
                  }`}>
                    +{analysis?.totalKeywords || 0}
                  </p>
                  <p className="text-xs text-gray-500">vs 0 default</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Replacements</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analysis?.totalReplacements || 0}
                  </p>
                  <p className="text-xs text-gray-500">text replacements</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Accuracy Impact</p>
                  <p className={`text-2xl font-bold ${
                    analysis?.accuracyChange && analysis.accuracyChange < 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {(analysis?.accuracyChange || 0) > 0 ? '+' : ''}{analysis?.accuracyChange ? Number(analysis.accuracyChange).toFixed(1) : 0}%
                  </p>
                  <p className="text-xs text-gray-500">vs factory default</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Problem Keywords</p>
                  <p className="text-2xl font-bold text-red-600">
                    {analysis?.problematicKeywords?.length || 0}
                  </p>
                  <p className="text-xs text-gray-500">hurting accuracy</p>
                </div>
              </div>

              {/* Problematic Keywords List */}
              {analysis?.problematicKeywords && analysis.problematicKeywords.length > 0 && (
                <div>
                  <h3 className="font-medium mb-2">Top Problematic Keywords</h3>
                  <div className="bg-red-50 rounded-lg p-4">
                    <div className="space-y-2">
                      {analysis.problematicKeywords.slice(0, 5).map((kw, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="font-mono text-sm">{kw.keyword}</span>
                          <span className="text-sm text-red-600">
                            Impact: {kw.impact ? Number(kw.impact).toFixed(1) : 0}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleQuickFix}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Quick Fix
                </button>
                <button
                  onClick={() => handleRollback('factory')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset to Factory Defaults
                </button>
                <button
                  onClick={handleTestConfig}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                  disabled={isTesting}
                >
                  <Play className="w-4 h-4" />
                  Test Current Config
                </button>
                <button
                  onClick={loadCurrentConfig}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </div>

            {/* Current Configuration Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Current Configuration</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-medium">{currentConfig?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Model:</span>
                  <span className="font-mono text-sm">{currentConfig?.config.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Keywords:</span>
                  <span className="font-medium">{currentConfig?.keywords_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Replacements:</span>
                  <span className="font-medium">{currentConfig?.replacements_count || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">WER:</span>
                  <span className="font-medium">{((currentConfig?.word_error_rate || 0) * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Test Results */}
            {testResults && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Test Results</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Accuracy</p>
                    <p className="text-2xl font-bold">{testResults.testConfig?.accuracy}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">WER</p>
                    <p className="text-2xl font-bold">{testResults.testConfig?.wer}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Processing Time</p>
                    <p className="text-2xl font-bold">{testResults.testConfig?.processingTime}ms</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Word Count</p>
                    <p className="text-2xl font-bold">{testResults.testConfig?.wordCount}</p>
                  </div>
                </div>

                {testResults.recommendations && testResults.recommendations.length > 0 && (
                  <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
                    <h3 className="font-medium mb-2">Recommendations</h3>
                    <ul className="space-y-1">
                      {testResults.recommendations.map((rec: string, idx: number) => (
                        <li key={idx} className="text-sm text-yellow-800">• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'keywords' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Keywords Management</h2>
              <div className="flex gap-3">
                <input
                  type="search"
                  placeholder="Search keywords..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                />
                <button
                  onClick={() => {
                    if (selectedKeywords.size > 0) {
                      alert(`Remove ${selectedKeywords.size} keywords?`);
                    }
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  disabled={selectedKeywords.size === 0}
                >
                  <Trash2 className="w-4 h-4 inline mr-2" />
                  Remove Selected ({selectedKeywords.size})
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {currentConfig?.config.keywords?.map((keyword: string, idx: number) => {
                const [word, boost] = keyword.split(':');
                const isProblematic = analysis?.problematicKeywords?.some(k => k.keyword === word);
                const matchesSearch = !searchTerm || word.toLowerCase().includes(searchTerm.toLowerCase());

                if (!matchesSearch) return null;

                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isProblematic ? 'border-red-200 bg-red-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedKeywords.has(keyword)}
                        onChange={(e) => {
                          const newSet = new Set(selectedKeywords);
                          if (e.target.checked) {
                            newSet.add(keyword);
                          } else {
                            newSet.delete(keyword);
                          }
                          setSelectedKeywords(newSet);
                        }}
                        className="rounded"
                      />
                      <span className="font-mono">{word}</span>
                      <span className="text-sm text-gray-500">Boost: {boost || 1}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      {isProblematic && (
                        <span className="text-sm text-red-600 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" />
                          Harmful
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'test' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Test Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Audio URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/audio.mp3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Expected Text (Optional)</label>
                <textarea
                  placeholder="Enter the expected transcription for accuracy calculation"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg h-24"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleTestConfig}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={isTesting}
                >
                  {isTesting ? 'Testing...' : 'Test Current Config'}
                </button>
                <button
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Test Factory Default
                </button>
                <button
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Compare Configurations
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'configs' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-6">Saved Configurations</h2>
            <div className="text-center text-gray-500 py-8">
              Configuration management coming soon
            </div>
          </div>
        )}
      </div>
    </div>
  );
}