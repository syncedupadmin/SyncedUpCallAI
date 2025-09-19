'use client';

import { useState, useEffect } from 'react';
import { Switch } from '@headlessui/react';
import { toast } from 'sonner';
import DualListBox from './DualListBox';

interface ControlSettings {
  system_enabled: boolean;
  active_campaigns: string[];
  active_lists: string[];
  active_dispositions: string[];
  active_agents: string[];
  last_sync?: string;
  next_sync?: string;
}

interface Agent {
  user_id: string;
  name: string;
  email?: string;
  campaigns?: string[];
  lastActivity?: string;
  totalEvents?: number;
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
  const [switchSaving, setSwitchSaving] = useState(false);

  // Date range for agent fetching
  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);

  // Agent management
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Dynamic options from Convoso
  const [availableCampaigns, setAvailableCampaigns] = useState<string[]>([]);
  const [availableLists, setAvailableLists] = useState<string[]>([]);
  const [availableDispositions, setAvailableDispositions] = useState<string[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  // Agents will now be dynamically loaded
  const availableAgents = agents.map(a => a.name);

  useEffect(() => {
    loadSettings();
    // Refresh every 30 seconds
    const interval = setInterval(loadSettings, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    try {
      // TEMPORARY: Using noauth endpoint for testing
      const response = await fetch('/api/convoso/control-noauth');
      if (response.ok) {
        const data = await response.json();
        console.log('[ConvosoControlBoard] Loaded settings:', data);
        setSettings(data);
      } else {
        console.error('[ConvosoControlBoard] Failed to load settings:', response.status);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Failed to load control settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Please select both start and end dates');
      return;
    }

    setLoadingAgents(true);
    try {
      // Fetch agents
      const agentParams = new URLSearchParams({ dateFrom, dateTo });
      const agentResponse = await fetch(`/api/convoso/get-agents?${agentParams}`);

      if (!agentResponse.ok) {
        throw new Error('Failed to fetch agents');
      }

      const agentData = await agentResponse.json();
      const fetchedAgents = agentData.agents || [];
      setAgents(fetchedAgents);

      // Fetch sample calls to get campaigns, lists, and dispositions
      const callParams = new URLSearchParams({ dateFrom, dateTo });
      const callResponse = await fetch(`/api/convoso/search-noauth?${callParams}`);

      let campaigns: string[] = [];
      let lists: string[] = [];
      let dispositions: string[] = [];

      if (callResponse.ok) {
        const callData = await callResponse.json();

        // Extract unique values from the calls
        if (callData.filterOptions) {
          campaigns = callData.filterOptions.campaigns || [];
          lists = callData.filterOptions.lists || [];
          dispositions = callData.filterOptions.dispositions || [];

          setAvailableCampaigns(campaigns);
          setAvailableLists(lists);
          setAvailableDispositions(dispositions);
        }

        toast.success(`Loaded ${fetchedAgents.length} agents and filter options`);
      } else {
        toast.warning(`Loaded ${fetchedAgents.length} agents, but couldn't fetch filter options`);
      }

      setOptionsLoaded(true);

      // Update settings to include only valid options
      setSettings(prev => ({
        ...prev,
        active_agents: prev.active_agents.filter(agentName =>
          fetchedAgents.some((a: Agent) => a.name === agentName)
        ),
        active_campaigns: prev.active_campaigns.filter(c => campaigns.includes(c)),
        active_lists: prev.active_lists.filter(l => lists.includes(l)),
        active_dispositions: prev.active_dispositions.filter(d => dispositions.includes(d))
      }));

    } catch (error) {
      console.error('Error fetching filter options:', error);
      toast.error('Failed to fetch filter options');
    } finally {
      setLoadingAgents(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      // TEMPORARY: Using noauth endpoint for testing
      const response = await fetch('/api/convoso/control-noauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        toast.success('Control settings saved successfully!');
        await loadSettings(); // Reload to get updated timestamps
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[ConvosoControlBoard] Save failed:', errorData);
        throw new Error(errorData.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save control settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleSystem = async () => {
    if (switchSaving) return; // Prevent multiple clicks

    const newEnabledState = !settings.system_enabled;
    setSwitchSaving(true);

    // Update local state immediately for UI responsiveness
    setSettings(prev => ({
      ...prev,
      system_enabled: newEnabledState
    }));

    // Auto-save the system enabled state
    try {
      const response = await fetch('/api/convoso/control-noauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          system_enabled: newEnabledState
        })
      });

      if (response.ok) {
        toast.success(`Auto-sync ${newEnabledState ? 'ENABLED' : 'DISABLED'}!`);
        // Reload to get updated timestamps
        setTimeout(loadSettings, 500);
      } else {
        // Revert on failure
        setSettings(prev => ({
          ...prev,
          system_enabled: !newEnabledState
        }));
        toast.error('Failed to update system status');
      }
    } catch (error) {
      console.error('Error toggling system:', error);
      // Revert on error
      setSettings(prev => ({
        ...prev,
        system_enabled: !newEnabledState
      }));
      toast.error('Failed to update system status');
    } finally {
      setSwitchSaving(false);
    }
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
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '32px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07)',
        border: '1px solid #e5e7eb'
      }}>
        <div className="animate-pulse">
          <div style={{ height: '32px', background: '#f3f4f6', borderRadius: '6px', width: '40%', marginBottom: '24px' }}></div>
          <div style={{ height: '200px', background: '#f9fafb', borderRadius: '8px' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07)',
      border: '1px solid #e5e7eb',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 32px',
        borderBottom: '1px solid #e5e7eb',
        background: 'linear-gradient(to right, #f9fafb, #ffffff)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ fontSize: '28px' }}>🎛️</span>
              Convoso Control Board
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
              Manage automatic synchronization settings and call filters
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              padding: '6px 12px',
              borderRadius: '20px',
              background: settings.system_enabled ? '#dcfce7' : '#f3f4f6',
              border: `1px solid ${settings.system_enabled ? '#86efac' : '#e5e7eb'}`
            }}>
              <span style={{
                fontSize: '13px',
                fontWeight: '600',
                color: settings.system_enabled ? '#15803d' : '#6b7280'
              }}>
                {settings.system_enabled ? '● ACTIVE' : '○ INACTIVE'}
              </span>
            </div>
            <Switch
              checked={settings.system_enabled}
              onChange={toggleSystem}
              disabled={switchSaving}
              style={{
                background: switchSaving ? '#9ca3af' : (settings.system_enabled ? '#10b981' : '#d1d5db'),
                position: 'relative',
                display: 'inline-flex',
                height: '32px',
                width: '60px',
                alignItems: 'center',
                borderRadius: '9999px',
                transition: 'background-color 0.2s',
                cursor: switchSaving ? 'wait' : 'pointer',
                opacity: switchSaving ? 0.7 : 1
              }}
            >
              <span className="sr-only">Enable system</span>
              <span
                style={{
                  transform: settings.system_enabled ? 'translateX(28px)' : 'translateX(2px)',
                  display: 'inline-block',
                  height: '28px',
                  width: '28px',
                  borderRadius: '9999px',
                  background: '#ffffff',
                  transition: 'transform 0.2s',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                }}
              >
                {switchSaving && (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    fontSize: '12px'
                  }}>
                    ⏳
                  </span>
                )}
              </span>
            </Switch>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '32px' }}>
        {/* Agent Loading Section */}
        <div style={{
          padding: '20px',
          borderRadius: '8px',
          background: '#f0f9ff',
          border: '1px solid #3b82f6',
          marginBottom: '24px'
        }}>
          <h3 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#1e40af',
            marginBottom: '16px'
          }}>
            Load Filter Options from Convoso
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto',
            gap: '12px',
            alignItems: 'end'
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '4px'
              }}>
                Start Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: '#ffffff'
                }}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '4px'
              }}>
                End Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: '#ffffff'
                }}
              />
            </div>
            <button
              onClick={fetchFilterOptions}
              disabled={loadingAgents}
              style={{
                padding: '8px 20px',
                background: loadingAgents ? '#9ca3af' : '#3b82f6',
                color: '#ffffff',
                borderRadius: '6px',
                border: 'none',
                fontSize: '14px',
                fontWeight: '500',
                cursor: loadingAgents ? 'not-allowed' : 'pointer'
              }}
            >
              {loadingAgents ? 'Loading...' : optionsLoaded ? `Refresh Data` : 'Load Filter Options'}
            </button>
          </div>
        </div>

        {/* Status Card */}
        <div style={{
          padding: '20px',
          borderRadius: '8px',
          background: settings.system_enabled
            ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'
            : 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
          border: `1px solid ${settings.system_enabled ? '#bbf7d0' : '#e5e7eb'}`,
          marginBottom: '32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                System Status
              </div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: settings.system_enabled ? '#059669' : '#374151' }}>
                {settings.system_enabled ? 'Auto-Sync Active' : 'Auto-Sync Disabled'}
              </div>
              {settings.last_sync && (
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
                  Last synchronized: {formatTime(settings.last_sync)}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Next Sync
              </div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                {settings.system_enabled ? getNextSyncTime() : '—'}
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                Every 15 minutes
              </div>
            </div>
          </div>
        </div>

        {/* Filter Sections */}
        <div style={{ marginBottom: '32px' }}>
          {!optionsLoaded ? (
            <div style={{
              padding: '40px',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              textAlign: 'center',
              color: '#6b7280',
              fontSize: '14px'
            }}>
              Please load filter options using the date selector above
            </div>
          ) : (
            <>
              <DualListBox
                title="Active Campaigns"
                icon="📢"
                availableItems={availableCampaigns}
                selectedItems={settings.active_campaigns}
                onItemsChange={(items) => setSettings(prev => ({ ...prev, active_campaigns: items }))}
                height="200px"
              />

              <DualListBox
                title="Active Lists"
                icon="📋"
                availableItems={availableLists}
                selectedItems={settings.active_lists}
                onItemsChange={(items) => setSettings(prev => ({ ...prev, active_lists: items }))}
                height="200px"
              />

              <DualListBox
                title="Active Dispositions"
                icon="✅"
                availableItems={availableDispositions}
                selectedItems={settings.active_dispositions}
                onItemsChange={(items) => setSettings(prev => ({ ...prev, active_dispositions: items }))}
                height="200px"
              />

              <DualListBox
                title="Active Agents"
                icon="👤"
                availableItems={availableAgents}
                selectedItems={settings.active_agents}
                onItemsChange={(items) => setSettings(prev => ({ ...prev, active_agents: items }))}
                height="250px"
              />
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          paddingTop: '24px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <button
            onClick={saveSettings}
            disabled={saving}
            style={{
              flex: 1,
              padding: '12px 24px',
              background: saving ? '#9ca3af' : '#10b981',
              color: '#ffffff',
              borderRadius: '8px',
              border: 'none',
              fontSize: '15px',
              fontWeight: '600',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
            onMouseEnter={(e) => {
              if (!saving) {
                e.currentTarget.style.background = '#059669';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.15)';
              }
            }}
            onMouseLeave={(e) => {
              if (!saving) {
                e.currentTarget.style.background = '#10b981';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
              }
            }}
          >
            {saving ? 'Saving Changes...' : '💾 Save Settings'}
          </button>
          <button
            onClick={resetToDefault}
            style={{
              padding: '12px 24px',
              background: '#ffffff',
              color: '#6b7280',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f9fafb';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          >
            ↺ Reset to Default
          </button>
        </div>
      </div>
    </div>
  );
}