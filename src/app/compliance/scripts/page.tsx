'use client';

import { useState, useEffect } from 'react';
import { Shield, Upload, Play, Trash2, FileText, FileCode } from 'lucide-react';

interface Script {
  id: string;
  script_name: string;
  script_version: string;
  script_text: string;
  required_phrases: string[];
  active: boolean;
  strict_mode: boolean;
  created_at: string;
  updated_at: string;
}

interface Template {
  id: string;
  name: string;
  product_type: string;
  script_text: string;
  required_phrases: string[];
}

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  // Upload form state
  const [scriptName, setScriptName] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [productType, setProductType] = useState('');
  const [state, setState] = useState('');

  useEffect(() => {
    loadScripts();
    loadTemplates();
  }, []);

  const loadScripts = async () => {
    try {
      const res = await fetch('/api/admin/post-close/scripts');
      const data = await res.json();
      setScripts(data.scripts || []);
    } catch (error) {
      console.error('Failed to load scripts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await fetch('/api/admin/post-close/templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const useTemplate = async (template: Template) => {
    setScriptName(template.name);
    setScriptText(template.script_text);
    setProductType(template.product_type || '');
    setShowTemplates(false);
  };

  const uploadScript = async () => {
    if (!scriptName || !scriptText) {
      alert('Please fill in script name and text');
      return;
    }

    try {
      setUploading(true);
      const res = await fetch('/api/admin/post-close/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script_name: scriptName,
          script_text: scriptText,
          product_type: productType || null,
          state: state || null,
          required_phrases: extractRequiredPhrases(scriptText)
        })
      });

      if (res.ok) {
        alert('Script uploaded successfully!');
        setScriptName('');
        setScriptText('');
        setProductType('');
        setState('');
        loadScripts();
      } else {
        const data = await res.json();
        alert('Upload failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload script');
    } finally {
      setUploading(false);
    }
  };

  const extractRequiredPhrases = (text: string): string[] => {
    // Split by sentence and filter out empty lines
    return text.split(/[\.\!\?]\s+/).filter(s => s.trim().length > 10);
  };

  const activateScript = async (scriptId: string) => {
    if (!confirm('Activate this script? This will deactivate any other active scripts.')) return;

    try {
      const res = await fetch('/api/admin/post-close/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate', script_id: scriptId })
      });

      if (res.ok) {
        alert('Script activated!');
        loadScripts();
      } else {
        alert('Failed to activate script');
      }
    } catch (error) {
      console.error('Activation error:', error);
    }
  };

  const toggleStrictMode = async (scriptId: string, currentValue: boolean) => {
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

      if (res.ok) {
        loadScripts();
      }
    } catch (error) {
      console.error('Toggle error:', error);
    }
  };

  const deleteScript = async (scriptId: string) => {
    if (!confirm('Delete this script? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/admin/post-close/scripts?id=${scriptId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        alert('Script deleted');
        loadScripts();
      } else {
        const data = await res.json();
        alert('Delete failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading scripts...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Script Management</h1>
        <p className="text-gray-400 mt-1">Upload and manage post-close compliance scripts</p>
      </div>

      {/* Upload Form */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-cyan-500" />
            Upload New Script
          </h2>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <FileCode className="w-4 h-4" />
            {showTemplates ? 'Hide Templates' : 'Use Template'}
          </button>
        </div>

        {/* Template Selection */}
        {showTemplates && (
          <div className="mb-6 p-4 bg-gray-900 rounded-lg">
            <h3 className="text-sm font-bold text-purple-400 mb-3">Choose a Template</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => useTemplate(template)}
                  className="text-left p-3 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-600 hover:border-purple-500 transition-all"
                >
                  <div className="font-medium text-white text-sm">{template.name}</div>
                  <div className="text-xs text-gray-400 mt-1">{template.product_type}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Script Name (e.g., FL ACA Post-Close v2.1)"
              value={scriptName}
              onChange={(e) => setScriptName(e.target.value)}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-cyan-500 outline-none"
            />
            <input
              type="text"
              placeholder="Product Type (optional)"
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-cyan-500 outline-none"
            />
            <input
              type="text"
              placeholder="State (optional)"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-cyan-500 outline-none"
            />
          </div>

          <textarea
            placeholder="Paste your post-close script here..."
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            rows={10}
            className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-cyan-500 outline-none font-mono text-sm"
          />

          <button
            onClick={uploadScript}
            disabled={uploading}
            className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {uploading ? 'Uploading...' : 'Upload Script'}
          </button>
        </div>
      </div>

      {/* Scripts List */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Your Scripts</h2>

        {scripts.length > 0 ? scripts.map((script) => (
          <div key={script.id} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-bold text-white">{script.script_name}</h3>
                  {script.active && (
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded-full border border-green-500/30">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400">Version: {script.script_version}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Created: {new Date(script.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!script.active && (
                  <button
                    onClick={() => activateScript(script.id)}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Activate
                  </button>
                )}
                {!script.active && (
                  <button
                    onClick={() => deleteScript(script.id)}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Strict Mode Toggle */}
            <div className="mb-4 p-4 bg-gray-900/50 rounded-lg">
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
                    checked={script.strict_mode}
                    onChange={() => toggleStrictMode(script.id, script.strict_mode)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                </label>
              </div>
            </div>

            {/* Script Preview */}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-cyan-400 hover:text-cyan-300">
                View Script Text
              </summary>
              <div className="mt-3 p-4 bg-gray-900 rounded-lg border border-gray-700">
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">{script.script_text}</pre>
              </div>
            </details>
          </div>
        )) : (
          <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No scripts uploaded yet</p>
            <p className="text-sm text-gray-500 mt-1">Upload your first post-close script above</p>
          </div>
        )}
      </div>
    </div>
  );
}
