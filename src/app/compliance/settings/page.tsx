'use client';

import { useState, useEffect } from 'react';
import { Settings, Shield, Bell, Database, Save, Key, Check, X, Loader2 } from 'lucide-react';

interface ComplianceSettings {
  strict_mode_threshold: number;
  fuzzy_mode_threshold: number;
  auto_analyze_new_calls: boolean;
  email_notifications: boolean;
  notification_email: string;
}

interface ConvosoCredentials {
  auth_token: string;
  base_url: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<ComplianceSettings>({
    strict_mode_threshold: 98,
    fuzzy_mode_threshold: 80,
    auto_analyze_new_calls: true,
    email_notifications: false,
    notification_email: ''
  });
  const [convosoCredentials, setConvosoCredentials] = useState<ConvosoCredentials>({
    auth_token: '',
    base_url: 'https://api.convoso.com/v1'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [hasCredentials, setHasCredentials] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load compliance settings
      const settingsRes = await fetch('/api/compliance/settings');
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      }

      // Load Convoso credentials
      const credentialsRes = await fetch('/api/compliance/convoso-credentials');
      if (credentialsRes.ok) {
        const data = await credentialsRes.json();
        if (data.hasCredentials) {
          setHasCredentials(true);
          // Don't set actual credentials for security
          setConvosoCredentials({
            auth_token: '••••••••',
            base_url: data.base_url || 'https://api.convoso.com/v1'
          });
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/compliance/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        alert('Settings saved successfully!');
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const saveConvosoCredentials = async () => {
    if (!convosoCredentials.auth_token) {
      alert('Please enter your Convoso auth token');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/compliance/convoso-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(convosoCredentials)
      });

      if (res.ok) {
        setHasCredentials(true);
        alert('Convoso credentials saved successfully!');
        // Mask the credentials after saving
        setConvosoCredentials({
          auth_token: '••••••••',
          base_url: convosoCredentials.base_url
        });
      } else {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save credentials');
      }
    } catch (error: any) {
      console.error('Failed to save Convoso credentials:', error);
      alert(error.message || 'Failed to save Convoso credentials');
    } finally {
      setSaving(false);
    }
  };

  const testConvosoConnection = async () => {
    if (!convosoCredentials.auth_token) {
      alert('Please enter your Convoso auth token');
      return;
    }

    try {
      setTestingConnection(true);
      setConnectionStatus('idle');

      const res = await fetch('/api/compliance/convoso-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(convosoCredentials)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setConnectionStatus('success');
        setTimeout(() => setConnectionStatus('idle'), 3000);
      } else {
        setConnectionStatus('error');
        alert(data.error || 'Connection failed');
        setTimeout(() => setConnectionStatus('idle'), 3000);
      }
    } catch (error: any) {
      console.error('Failed to test connection:', error);
      setConnectionStatus('error');
      alert('Failed to test connection');
      setTimeout(() => setConnectionStatus('idle'), 3000);
    } finally {
      setTestingConnection(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Compliance Settings</h1>
        <p className="text-gray-400 mt-1">Configure your compliance verification preferences</p>
      </div>

      {/* Convoso API Configuration */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-cyan-500" />
          Convoso API Configuration
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Auth Token
            </label>
            <input
              type="password"
              placeholder={hasCredentials ? "••••••••" : "Enter your Convoso auth token"}
              value={convosoCredentials.auth_token}
              onChange={(e) => setConvosoCredentials({ ...convosoCredentials, auth_token: e.target.value })}
              className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-cyan-500 outline-none"
              onFocus={() => {
                if (convosoCredentials.auth_token === '••••••••') {
                  setConvosoCredentials({ ...convosoCredentials, auth_token: '' });
                }
              }}
            />
            <p className="text-xs text-gray-400 mt-1">
              You can find your auth token in your Convoso account settings
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              API Base URL
            </label>
            <input
              type="text"
              placeholder="https://app.convoso.com/api/v1"
              value={convosoCredentials.base_url}
              onChange={(e) => setConvosoCredentials({ ...convosoCredentials, base_url: e.target.value })}
              className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-cyan-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Default: https://api.convoso.com/v1
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={testConvosoConnection}
              disabled={testingConnection}
              className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {testingConnection ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  {connectionStatus === 'success' ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : connectionStatus === 'error' ? (
                    <X className="w-4 h-4 text-red-500" />
                  ) : (
                    <Key className="w-4 h-4" />
                  )}
                  Test Connection
                </>
              )}
            </button>

            <button
              onClick={saveConvosoCredentials}
              disabled={saving}
              className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Credentials
            </button>

            {hasCredentials && (
              <span className="text-sm text-green-400 flex items-center gap-1">
                <Check className="w-4 h-4" />
                Credentials configured
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <p className="text-sm text-blue-300">
            <strong>Note:</strong> You can find your Convoso auth token in your Convoso account under Settings → API Access.
          </p>
        </div>
      </div>

      {/* Threshold Settings */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-cyan-500" />
          Matching Thresholds
        </h2>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Strict Mode Threshold
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="90"
                max="100"
                value={settings.strict_mode_threshold}
                onChange={(e) => setSettings({ ...settings, strict_mode_threshold: parseInt(e.target.value) })}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
              />
              <span className="text-2xl font-bold text-red-400 w-16 text-right">
                {settings.strict_mode_threshold}%
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Minimum score required for strict word-for-word matching. Recommended: 98%
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Fuzzy Mode Threshold
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="50"
                max="95"
                value={settings.fuzzy_mode_threshold}
                onChange={(e) => setSettings({ ...settings, fuzzy_mode_threshold: parseInt(e.target.value) })}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-600"
              />
              <span className="text-2xl font-bold text-green-400 w-16 text-right">
                {settings.fuzzy_mode_threshold}%
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Minimum score required for fuzzy paraphrasing matching. Recommended: 80%
            </p>
          </div>
        </div>
      </div>

      {/* Analysis Settings */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-500" />
          Analysis Settings
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
            <div>
              <label className="font-medium text-white flex items-center gap-2">
                Auto-Analyze New Calls
              </label>
              <p className="text-sm text-gray-400 mt-1">
                Automatically analyze new calls as they come in
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.auto_analyze_new_calls}
                onChange={(e) => setSettings({ ...settings, auto_analyze_new_calls: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-cyan-500" />
          Notifications
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg">
            <div>
              <label className="font-medium text-white flex items-center gap-2">
                Email Notifications
              </label>
              <p className="text-sm text-gray-400 mt-1">
                Receive email alerts for compliance failures
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.email_notifications}
                onChange={(e) => setSettings({ ...settings, email_notifications: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
            </label>
          </div>

          {settings.email_notifications && (
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Notification Email
              </label>
              <input
                type="email"
                placeholder="compliance@example.com"
                value={settings.notification_email}
                onChange={(e) => setSettings({ ...settings, notification_email: e.target.value })}
                className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-cyan-500 outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
        <p className="text-sm text-blue-300">
          <strong>Note:</strong> Changes to thresholds will only affect future compliance checks. Existing results will not be recalculated.
        </p>
      </div>
    </div>
  );
}
