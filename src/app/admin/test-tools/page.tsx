'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

interface TestTool {
  name: string;
  description: string;
  path: string;
  category: 'Convoso' | 'Recordings' | 'System' | 'Database';
  status?: 'operational' | 'warning' | 'error';
}

export default function TestToolsPage() {
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const testTools: TestTool[] = [
    // Convoso Integration Tools
    {
      name: '🔍 API Diagnostic Tool',
      description: 'Test Convoso API endpoints to find working configurations',
      path: '/test-diagnose',
      category: 'Convoso'
    },
    {
      name: '📅 Pull Historical Recordings',
      description: 'Bulk import recordings by date range with disposition filtering (NO LIMITS)',
      path: '/admin/pull-recordings',
      category: 'Convoso'
    },
    {
      name: '🎙️ Recording Fetch Test',
      description: 'Test fetching recordings from Convoso (legacy, max 100)',
      path: '/test-recordings',
      category: 'Recordings'
    },
    {
      name: '🎯 Smart Recording Matcher',
      description: 'Test smart matching algorithm with confidence scoring (max 10)',
      path: '/test-smart-recordings',
      category: 'Recordings'
    },
    {
      name: '📋 Review Unmatched Recordings',
      description: 'Manually review and assign recordings that could not be auto-matched',
      path: '/admin/review-recordings',
      category: 'Recordings'
    },
    // System Tools
    {
      name: '🔐 Admin Authentication Test',
      description: 'Check admin authentication status and permissions',
      path: '/api/auth/admin',
      category: 'System'
    },
    {
      name: '📊 Webhook Status',
      description: 'View recent webhook events and processing status',
      path: '/api/webhooks/convoso',
      category: 'System'
    },
    {
      name: '⏰ Process Recordings (Cron)',
      description: 'Manually trigger the recording fetch cron job',
      path: '/api/cron/process-recordings',
      category: 'System'
    },
    {
      name: '🧠 Smart Processing (Cron v2)',
      description: 'Trigger smart matching algorithm for all pending recordings',
      path: '/api/cron/process-recordings-v2',
      category: 'System'
    },
    // Database Tools
    {
      name: '📈 Smart Matching Status',
      description: 'View smart matching statistics and confidence levels',
      path: '/api/test/smart-recording-test',
      category: 'Database'
    },
    {
      name: '🗂️ Unmatched Queue Status',
      description: 'Check unmatched recordings queue and pending reviews',
      path: '/api/admin/unmatched-recordings',
      category: 'Database'
    },
    {
      name: '🔬 Fetch Test Status',
      description: 'Check recent recording fetch attempts and results',
      path: '/api/test/fetch-convoso-recordings',
      category: 'Database'
    }
  ];

  useEffect(() => {
    fetchSystemStatus();
  }, []);

  const fetchSystemStatus = async () => {
    try {
      // Fetch smart matching status
      const response = await fetch('/api/test/smart-recording-test');
      if (response.ok) {
        const data = await response.json();
        setSystemStatus(data.status);
      }
    } catch (error) {
      console.error('Error fetching system status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Convoso': return '🔌';
      case 'Recordings': return '🎙️';
      case 'System': return '⚙️';
      case 'Database': return '🗄️';
      default: return '📦';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Convoso': return 'bg-blue-50 border-blue-200';
      case 'Recordings': return 'bg-green-50 border-green-200';
      case 'System': return 'bg-purple-50 border-purple-200';
      case 'Database': return 'bg-amber-50 border-amber-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const isExternalLink = (path: string) => path.startsWith('/api/');

  const categories = ['Convoso', 'Recordings', 'System', 'Database'] as const;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">🛠️ Super Admin Test Tools</h1>
        <p className="text-gray-600">Development and testing utilities for Convoso integration - Live Dashboard</p>
      </div>

      {/* System Status Card */}
      {!loading && systemStatus && (
        <div className="mb-8 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">📊 System Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-white p-3 rounded border">
              <div className="text-gray-600">Unmatched Pending</div>
              <div className="text-2xl font-bold text-amber-600">
                {systemStatus?.unmatched_pending_review || 0}
              </div>
            </div>
            <div className="bg-white p-3 rounded border">
              <div className="text-gray-600">Exact Matches</div>
              <div className="text-2xl font-bold text-green-600">
                {systemStatus?.match_statistics?.exact || 0}
              </div>
            </div>
            <div className="bg-white p-3 rounded border">
              <div className="text-gray-600">Fuzzy Matches</div>
              <div className="text-2xl font-bold text-blue-600">
                {systemStatus?.match_statistics?.fuzzy || 0}
              </div>
            </div>
            <div className="bg-white p-3 rounded border">
              <div className="text-gray-600">Manual Matches</div>
              <div className="text-2xl font-bold text-purple-600">
                {systemStatus?.match_statistics?.manual || 0}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">⚡ Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/admin/pull-recordings"
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
          >
            📅 Pull Historical Recordings
          </a>
          <a
            href="/test-smart-recordings"
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
          >
            🎯 Test Smart Matching
          </a>
          <a
            href="/admin/review-recordings"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            📋 Review Unmatched
          </a>
          <a
            href="/test-diagnose"
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition"
          >
            🔍 Run Diagnostics
          </a>
          <button
            onClick={() => window.open('/api/cron/process-recordings-v2', '_blank')}
            className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition"
          >
            ⏰ Trigger Smart Cron
          </button>
        </div>
      </div>

      {/* Tools by Category */}
      {categories.map(category => (
        <div key={category} className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            {getCategoryIcon(category)} {category} Tools
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {testTools
              .filter(tool => tool.category === category)
              .map((tool, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-4 hover:shadow-lg transition ${getCategoryColor(category)}`}
                >
                  <h3 className="font-semibold text-lg mb-2">{tool.name}</h3>
                  <p className="text-gray-600 text-sm mb-3">{tool.description}</p>
                  {isExternalLink(tool.path) ? (
                    <button
                      onClick={() => window.open(tool.path, '_blank')}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
                    >
                      Open API Endpoint
                      <span className="text-xs">↗️</span>
                    </button>
                  ) : (
                    <Link
                      href={tool.path}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
                    >
                      Open Tool
                      <span className="text-xs">→</span>
                    </Link>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}

      {/* Documentation Section */}
      <div className="mt-12 p-6 bg-gray-50 border border-gray-200 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">📚 Quick Reference</h2>

        <div className="grid md:grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="font-semibold mb-2">🎯 Smart Matching Confidence Levels</h3>
            <ul className="space-y-1 text-gray-600">
              <li>✅ <strong>Exact (100%):</strong> Timestamps match within 1 second</li>
              <li>✅ <strong>Fuzzy (95%):</strong> Timestamps within 5 seconds</li>
              <li>⚠️ <strong>Probable (80%):</strong> Timestamps within 30 seconds</li>
              <li>❌ <strong>Unmatched:</strong> Goes to manual review queue</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">🔗 API Endpoints</h3>
            <ul className="space-y-1 text-gray-600">
              <li><strong>Webhook:</strong> /api/webhooks/convoso</li>
              <li><strong>Smart Cron:</strong> /api/cron/process-recordings-v2</li>
              <li><strong>Test API:</strong> /api/test/smart-recording-test</li>
              <li><strong>Admin API:</strong> /api/admin/assign-recording</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm">
            <strong>💡 Pro Tip:</strong> Always use dry run mode when testing.
            The smart matching system targets 98%+ automatic accuracy with 0% wrong agent attribution.
          </p>
        </div>
      </div>
    </div>
  );
}