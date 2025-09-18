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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        toast.success('Control settings saved successfully!');
        await loadSettings(); // Reload to get updated timestamps
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

  const selectAll = (filterType: keyof ControlSettings) => {
    const allOptions = {
      active_campaigns: availableCampaigns,
      active_lists: availableLists,
      active_dispositions: availableDispositions,
      active_agents: availableAgents
    };

    setSettings(prev => ({
      ...prev,
      [filterType]: allOptions[filterType as keyof typeof allOptions] || []
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
              style={{
                background: settings.system_enabled ? '#10b981' : '#d1d5db',
                position: 'relative',
                display: 'inline-flex',
                height: '32px',
                width: '60px',
                alignItems: 'center',
                borderRadius: '9999px',
                transition: 'background-color 0.2s',
                cursor: 'pointer'
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
              />
            </Switch>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '32px' }}>
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
          {[
            { key: 'active_campaigns', label: 'Active Campaigns', icon: '📢', options: availableCampaigns },
            { key: 'active_lists', label: 'Active Lists', icon: '📋', options: availableLists },
            { key: 'active_dispositions', label: 'Active Dispositions', icon: '✅', options: availableDispositions },
            { key: 'active_agents', label: 'Active Agents', icon: '👤', options: availableAgents }
          ].map(({ key, label, icon, options }) => (
            <div key={key} style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{icon}</span> {label}
                </h3>
                <button
                  onClick={() => selectAll(key as keyof ControlSettings)}
                  style={{
                    fontSize: '12px',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    color: '#4b5563',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e5e7eb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f3f4f6';
                  }}
                >
                  Select All
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '8px' }}>
                {options.map(option => (
                  <label
                    key={option}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: (settings[key as keyof ControlSettings] as string[]).includes(option) ? '#f0f9ff' : '#f9fafb',
                      border: `1px solid ${(settings[key as keyof ControlSettings] as string[]).includes(option) ? '#bfdbfe' : '#e5e7eb'}`,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!(settings[key as keyof ControlSettings] as string[]).includes(option)) {
                        e.currentTarget.style.background = '#f3f4f6';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = (settings[key as keyof ControlSettings] as string[]).includes(option) ? '#f0f9ff' : '#f9fafb';
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={(settings[key as keyof ControlSettings] as string[]).includes(option)}
                      onChange={() => toggleFilter(key as keyof ControlSettings, option)}
                      style={{
                        marginRight: '10px',
                        width: '16px',
                        height: '16px',
                        cursor: 'pointer'
                      }}
                    />
                    <span style={{ fontSize: '14px', color: '#374151' }}>{option}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
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