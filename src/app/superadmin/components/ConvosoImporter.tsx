'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/src/lib/supabase/client';

interface Call {
  recording_id: string;
  lead_id: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  recording_url: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone: string;
  customer_email: string;
  agent_id: string;
  agent_name: string;
  disposition: string;
  campaign_name: string;
  list_name: string;
}

interface FilterOptions {
  campaigns: string[];
  lists: string[];
  dispositions: string[];
  agents: string[];
}

export default function ConvosoImporter() {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [calls, setCalls] = useState<Call[]>([]);
  const [filteredCalls, setFilteredCalls] = useState<Call[]>([]);
  const [selectedCalls, setSelectedCalls] = useState<Set<string>>(new Set());
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    campaigns: [],
    lists: [],
    dispositions: [],
    agents: []
  });

  // Initialize Supabase client
  const supabase = createClient();

  // Helper function to get auth token
  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  // Search parameters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');

  // Filters
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedDisposition, setSelectedDisposition] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedList, setSelectedList] = useState('');
  const [minDuration, setMinDuration] = useState(1); // Minimum 1 second (no abandoned calls)
  const [maxDuration, setMaxDuration] = useState(3600);

  // Sorting
  const [sortField, setSortField] = useState<keyof Call>('start_time');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const searchCalls = async () => {
    if (!dateFrom || !dateTo) {
      toast.error('Please select both start and end dates');
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        ...(timeFrom && { timeFrom }),
        ...(timeTo && { timeTo })
      });

      // TEMPORARY: Using noauth endpoint for testing
      const response = await fetch(`/api/convoso/search-noauth?${params}`, {
        headers: {
          'Content-Type': 'application/json',
        }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Search failed:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to search calls');
      }

      const data = await response.json();
      setCalls(data.calls || []);
      setFilterOptions(data.filterOptions || {
        campaigns: [],
        lists: [],
        dispositions: [],
        agents: []
      });

      // Apply initial filters
      applyFilters();
      toast.success(`Found ${data.calls?.length || 0} calls`);
    } catch (error) {
      console.error('Error searching calls:', error);
      toast.error('Failed to search calls');
    } finally {
      setLoading(false);
    }
  };

  const importCalls = async () => {
    const callsToImport = Array.from(selectedCalls).map(id =>
      calls.find(c => c.recording_id === id)
    ).filter(Boolean);

    if (callsToImport.length === 0) {
      toast.error('No calls selected for import');
      return;
    }

    setImporting(true);
    try {
      const response = await fetch('/api/convoso/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`
        },
        credentials: 'include',
        body: JSON.stringify({
          calls: callsToImport
        })
      });

      if (!response.ok) {
        throw new Error('Failed to import calls');
      }

      const data = await response.json();
      toast.success(`Imported ${data.imported} calls, ${data.queued_for_transcription} queued for transcription`);

      // Clear selection
      setSelectedCalls(new Set());
    } catch (error) {
      console.error('Error importing calls:', error);
      toast.error('Failed to import calls');
    } finally {
      setImporting(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...calls];

    if (selectedAgent) {
      filtered = filtered.filter(c => c.agent_name === selectedAgent);
    }
    if (selectedDisposition) {
      filtered = filtered.filter(c => c.disposition === selectedDisposition);
    }
    if (selectedCampaign) {
      filtered = filtered.filter(c => c.campaign_name === selectedCampaign);
    }
    if (selectedList) {
      filtered = filtered.filter(c => c.list_name === selectedList);
    }

    filtered = filtered.filter(c =>
      c.duration_seconds >= minDuration && c.duration_seconds <= maxDuration
    );

    // Apply sorting
    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const modifier = sortDirection === 'asc' ? 1 : -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * modifier;
      }
      return String(aVal).localeCompare(String(bVal)) * modifier;
    });

    setFilteredCalls(filtered);
  };

  const handleFilterChange = () => {
    applyFilters();
  };

  const toggleCallSelection = (id: string) => {
    const newSelection = new Set(selectedCalls);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedCalls(newSelection);
  };

  const selectAll = () => {
    if (selectedCalls.size === filteredCalls.length) {
      setSelectedCalls(new Set());
    } else {
      setSelectedCalls(new Set(filteredCalls.map(c => c.recording_id)));
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
        <h2 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: '#111827',
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '28px' }}>📥</span>
          Convoso Call Importer
        </h2>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
          Search and import call recordings from Convoso
        </p>
      </div>

      {/* Main Content */}
      <div style={{ padding: '32px' }}>
        {/* Search Section */}
        <div style={{
          padding: '24px',
          background: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          marginBottom: '24px'
        }}>
          <h3 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#374151',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>🔍</span> Search Calls
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '20px'
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '4px'
              }}>
                Date From
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
                  background: '#ffffff',
                  color: '#111827'
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '4px'
              }}>
                Date To
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
                  background: '#ffffff',
                  color: '#111827'
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '4px'
              }}>
                Time From (optional)
              </label>
              <input
                type="time"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  color: '#111827'
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '4px'
              }}>
                Time To (optional)
              </label>
              <input
                type="time"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '14px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  color: '#111827'
                }}
              />
            </div>
          </div>

          <button
            onClick={searchCalls}
            disabled={loading}
            style={{
              padding: '10px 24px',
              background: loading ? '#9ca3af' : '#3b82f6',
              color: '#ffffff',
              borderRadius: '6px',
              border: 'none',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = '#2563eb';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.background = '#3b82f6';
              }
            }}
          >
            {loading ? 'Searching...' : '🔍 Search Calls'}
          </button>
        </div>

        {/* Filters Section */}
        {calls.length > 0 && (
          <div style={{
            padding: '20px',
            background: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            marginBottom: '24px'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>🎯</span> Filters
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                  Agent
                </label>
                <select
                  value={selectedAgent}
                  onChange={(e) => {
                    setSelectedAgent(e.target.value);
                    handleFilterChange();
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: '#111827'
                  }}
                >
                  <option value="">All Agents</option>
                  {filterOptions.agents.map(agent => (
                    <option key={agent} value={agent}>{agent}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                  Disposition
                </label>
                <select
                  value={selectedDisposition}
                  onChange={(e) => {
                    setSelectedDisposition(e.target.value);
                    handleFilterChange();
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: '#111827'
                  }}
                >
                  <option value="">All Dispositions</option>
                  {filterOptions.dispositions.map(disp => (
                    <option key={disp} value={disp}>{disp}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                  Campaign
                </label>
                <select
                  value={selectedCampaign}
                  onChange={(e) => {
                    setSelectedCampaign(e.target.value);
                    handleFilterChange();
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: '#111827'
                  }}
                >
                  <option value="">All Campaigns</option>
                  {filterOptions.campaigns.map(camp => (
                    <option key={camp} value={camp}>{camp}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                  List
                </label>
                <select
                  value={selectedList}
                  onChange={(e) => {
                    setSelectedList(e.target.value);
                    handleFilterChange();
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: '#111827'
                  }}
                >
                  <option value="">All Lists</option>
                  {filterOptions.lists.map(list => (
                    <option key={list} value={list}>{list}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                  Min Duration (sec)
                </label>
                <input
                  type="number"
                  value={minDuration}
                  min="1"
                  onChange={(e) => {
                    setMinDuration(Math.max(1, Number(e.target.value)));
                    handleFilterChange();
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: '#111827'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '4px' }}>
                  Max Duration (sec)
                </label>
                <input
                  type="number"
                  value={maxDuration}
                  onChange={(e) => {
                    setMaxDuration(Number(e.target.value));
                    handleFilterChange();
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '13px',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    background: '#ffffff',
                    color: '#111827'
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {filteredCalls.length > 0 && (
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#374151'
              }}>
                📞 Found {filteredCalls.length} calls
              </h3>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={selectAll}
                  style={{
                    padding: '8px 16px',
                    background: '#ffffff',
                    color: '#4b5563',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f9fafb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#ffffff';
                  }}
                >
                  {selectedCalls.size === filteredCalls.length ? 'Deselect All' : 'Select All'}
                </button>

                <button
                  onClick={importCalls}
                  disabled={importing || selectedCalls.size === 0}
                  style={{
                    padding: '8px 20px',
                    background: importing || selectedCalls.size === 0 ? '#9ca3af' : '#10b981',
                    color: '#ffffff',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: importing || selectedCalls.size === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (!importing && selectedCalls.size > 0) {
                      e.currentTarget.style.background = '#059669';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!importing && selectedCalls.size > 0) {
                      e.currentTarget.style.background = '#10b981';
                    }
                  }}
                >
                  {importing ? 'Importing...' : `📤 Import Selected (${selectedCalls.size})`}
                </button>
              </div>
            </div>

            {/* Table */}
            <div style={{
              overflowX: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              background: '#ffffff'
            }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px'
              }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>
                      <input
                        type="checkbox"
                        checked={selectedCalls.size === filteredCalls.length && filteredCalls.length > 0}
                        onChange={selectAll}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', cursor: 'pointer' }}
                        onClick={() => {
                          setSortField('start_time');
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                          handleFilterChange();
                        }}>
                      Date/Time {sortField === 'start_time' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>
                      Customer
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', cursor: 'pointer' }}
                        onClick={() => {
                          setSortField('agent_name');
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                          handleFilterChange();
                        }}>
                      Agent {sortField === 'agent_name' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', cursor: 'pointer' }}
                        onClick={() => {
                          setSortField('duration_seconds');
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                          handleFilterChange();
                        }}>
                      Duration {sortField === 'duration_seconds' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', cursor: 'pointer' }}
                        onClick={() => {
                          setSortField('disposition');
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                          handleFilterChange();
                        }}>
                      Disposition {sortField === 'disposition' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>
                      Campaign
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCalls.map((call, index) => (
                    <tr
                      key={call.recording_id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        background: index % 2 === 0 ? '#ffffff' : '#fafafa',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f0f9ff'}
                      onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? '#ffffff' : '#fafafa'}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <input
                          type="checkbox"
                          checked={selectedCalls.has(call.recording_id)}
                          onChange={() => toggleCallSelection(call.recording_id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '12px 16px', color: '#111827' }}>
                        {new Date(call.start_time).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#111827' }}>
                        <div style={{ fontWeight: '500' }}>
                          {call.customer_first_name} {call.customer_last_name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {call.customer_phone}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#111827' }}>
                        {call.agent_name}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#111827' }}>
                        {formatDuration(call.duration_seconds)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          background: call.disposition === 'SALE' ? '#dcfce7' : '#f3f4f6',
                          color: call.disposition === 'SALE' ? '#15803d' : '#4b5563'
                        }}>
                          {call.disposition}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#111827' }}>
                        {call.campaign_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}