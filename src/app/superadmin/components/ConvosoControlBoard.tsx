'use client';

import { useState, useEffect } from 'react';
import { Switch } from '@headlessui/react';
import { toast } from 'sonner';

interface ControlSettings {
  system_enabled: boolean;
  active_campaigns: string[];
  active_lists: string[];
  active_dispositions: string[];
  active_agents: string[];
  last_sync?: string;
  next_sync?: string;
}

export default function ConvosoControlBoard() {
  const [settings, setSettings] = useState<ControlSettings>({
    system_enabled: false,
    active_campaigns: [],
    active_lists: [],
    active_dispositions: [],
    active_agents: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Available options (these would come from API in production)
  const availableCampaigns = ['PHS Dialer', 'Medicare Sales', 'Final Expense'];
  const availableLists = ['PHS DATA - M3 Demon', 'PHS DATA - INX Overnight', 'Fresh Leads'];
  const availableDispositions = ['SALE', 'CALLBACK', 'NO ANSWER', 'AA', 'BUSY', 'DNC'];
  const availableAgents = ['401 ----JOE----', '402 ----ROB---', '404 ---KAREEM---', '405 ---MIKE---'];

  useEffect(() => {
    loadSettings();
    // Refresh every 30 seconds
    const interval = setInterval(loadSettings, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/convoso/control');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Failed to load control settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/convoso/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        toast.success('Control settings saved');
        await loadSettings();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save control settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleSystem = () => {
    setSettings(prev => ({
      ...prev,
      system_enabled: !prev.system_enabled
    }));
  };

  const toggleFilter = (filterType: keyof ControlSettings, value: string) => {
    setSettings(prev => {
      const current = prev[filterType] as string[];
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];

      return {
        ...prev,
        [filterType]: updated
      };
    });
  };

  const resetToDefault = () => {
    setSettings({
      system_enabled: false,
      active_campaigns: [],
      active_lists: [],
      active_dispositions: [],
      active_agents: []
    });
    toast.info('Reset to default settings - Click Save to apply');
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000 / 60);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} minutes ago`;
    return date.toLocaleTimeString();
  };

  const getNextSyncTime = () => {
    if (!settings.next_sync) return 'Unknown';
    const next = new Date(settings.next_sync);
    const now = new Date();
    const diff = Math.floor((next.getTime() - now.getTime()) / 1000 / 60);
    if (diff <= 0) return 'Any moment';
    return `in ${diff} minutes`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Convoso Control Board</h2>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500">
              Last sync: {formatTime(settings.last_sync)}
            </div>
            <div className="text-sm text-gray-500">
              Next sync: {getNextSyncTime()}
            </div>
          </div>
        </div>

        {/* Master Switch */}
        <div className="mb-8 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">System Status</h3>
              <p className="text-sm text-gray-600">
                Master switch to enable/disable all Convoso processing
              </p>
            </div>
            <Switch
              checked={settings.system_enabled}
              onChange={toggleSystem}
              className={`${
                settings.system_enabled ? 'bg-green-600' : 'bg-gray-200'
              } relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75`}
            >
              <span
                className={`${
                  settings.system_enabled ? 'translate-x-8' : 'translate-x-0'
                } pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out`}
              />
            </Switch>
          </div>
          <div className="mt-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              settings.system_enabled
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {settings.system_enabled ? '🟢 System Active' : '🔴 System Disabled'}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Campaigns Filter */}
          <div className="border rounded-lg p-4">
            <h4 className="font-medium mb-3">Campaign Filters</h4>
            <div className="space-y-2">
              {availableCampaigns.map(campaign => (
                <label key={campaign} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.active_campaigns.includes(campaign)}
                    onChange={() => toggleFilter('active_campaigns', campaign)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm">{campaign}</span>
                </label>
              ))}
            </div>
            {settings.active_campaigns.length === 0 && (
              <p className="text-xs text-gray-500 mt-2">All campaigns allowed when none selected</p>
            )}
          </div>

          {/* Lists Filter */}
          <div className="border rounded-lg p-4">
            <h4 className="font-medium mb-3">List Filters</h4>
            <div className="space-y-2">
              {availableLists.map(list => (
                <label key={list} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.active_lists.includes(list)}
                    onChange={() => toggleFilter('active_lists', list)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-ellipsis overflow-hidden">{list}</span>
                </label>
              ))}
            </div>
            {settings.active_lists.length === 0 && (
              <p className="text-xs text-gray-500 mt-2">All lists allowed when none selected</p>
            )}
          </div>

          {/* Dispositions Filter */}
          <div className="border rounded-lg p-4">
            <h4 className="font-medium mb-3">Disposition Filters</h4>
            <div className="space-y-2">
              {availableDispositions.map(disposition => (
                <label key={disposition} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.active_dispositions.includes(disposition)}
                    onChange={() => toggleFilter('active_dispositions', disposition)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm">{disposition}</span>
                </label>
              ))}
            </div>
            {settings.active_dispositions.length === 0 && (
              <p className="text-xs text-gray-500 mt-2">All dispositions allowed when none selected</p>
            )}
          </div>

          {/* Agents Filter */}
          <div className="border rounded-lg p-4">
            <h4 className="font-medium mb-3">Agent Filters</h4>
            <div className="space-y-2">
              {availableAgents.map(agent => (
                <label key={agent} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.active_agents.includes(agent)}
                    onChange={() => toggleFilter('active_agents', agent)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm">{agent}</span>
                </label>
              ))}
            </div>
            {settings.active_agents.length === 0 && (
              <p className="text-xs text-gray-500 mt-2">All agents allowed when none selected</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-4">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            onClick={resetToDefault}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Reset to Default
          </button>
        </div>
      </div>
    </div>
  );
}