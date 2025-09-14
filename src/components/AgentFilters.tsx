'use client';

import { useState, useEffect } from 'react';
import { User, Filter, Calendar, Check, X, ChevronDown } from 'lucide-react';

interface FilterValue {
  agent?: string;
  team?: string;
  disposition?: string;
  from?: string;
  to?: string;
  dateRange?: 'today' | '7d' | '30d' | 'custom';
}

interface AgentFiltersProps {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}

const DISPOSITIONS = [
  { value: '', label: 'All Dispositions' },
  { value: 'Completed', label: 'Completed' },
  { value: 'SALE', label: 'Sale' },
  { value: 'No Answer', label: 'No Answer' },
  { value: 'Busy', label: 'Busy' },
  { value: 'Failed', label: 'Failed' },
  { value: 'Voicemail', label: 'Voicemail' },
];

const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom Range' },
];

export default function AgentFilters({ value, onChange }: AgentFiltersProps) {
  const [agents, setAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDatePickers, setShowDatePickers] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    // Update date range based on selection
    if (value.dateRange && value.dateRange !== 'custom') {
      const now = new Date();
      let from = new Date();

      switch (value.dateRange) {
        case 'today':
          from.setHours(0, 0, 0, 0);
          break;
        case '7d':
          from.setDate(from.getDate() - 7);
          break;
        case '30d':
          from.setDate(from.getDate() - 30);
          break;
      }

      onChange({
        ...value,
        from: from.toISOString().split('T')[0],
        to: now.toISOString().split('T')[0],
      });
    }

    setShowDatePickers(value.dateRange === 'custom');
  }, [value.dateRange]);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      // Fetch distinct agents from the API
      const res = await fetch('/api/ui/agents/calls?limit=100&offset=0');
      const data = await res.json();

      if (data.ok && data.rows) {
        const agentNames = data.rows.map((row: any) => row.agent).filter(Boolean);
        setAgents(agentNames);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field: keyof FilterValue, newValue: string) => {
    onChange({
      ...value,
      [field]: newValue || undefined,
    });
  };

  const clearFilters = () => {
    onChange({});
    setShowDatePickers(false);
  };

  const hasActiveFilters = () => {
    return !!(value.agent || value.disposition || value.from || value.to || value.dateRange);
  };

  return (
    <div className="agent-filters" style={{
      padding: 20,
      background: 'rgba(20, 20, 22, 0.6)',
      borderRadius: 12,
      border: '1px solid rgba(255, 255, 255, 0.08)',
      marginBottom: 24
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={18} color="#a8a8b3" />
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Filters</h3>
          {hasActiveFilters() && (
            <span style={{
              padding: '2px 8px',
              borderRadius: 12,
              background: 'rgba(124, 58, 237, 0.2)',
              color: '#a78bfa',
              fontSize: 11,
              fontWeight: 500
            }}>
              Active
            </span>
          )}
        </div>
        {hasActiveFilters() && (
          <button
            onClick={clearFilters}
            className="btn btn-ghost"
            style={{
              padding: '6px 12px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <X size={14} />
            Clear All
          </button>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12
      }}>
        {/* Agent Filter */}
        <div className="filter-group">
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: '#6b6b7c',
            marginBottom: 6
          }}>
            <User size={14} />
            Agent
          </label>
          <div style={{ position: 'relative' }}>
            <select
              value={value.agent || ''}
              onChange={(e) => handleFilterChange('agent', e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px 32px 8px 12px',
                background: 'rgba(10, 10, 15, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 6,
                color: '#ffffff',
                fontSize: 13,
                appearance: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">All Agents</option>
              {agents.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: '#6b6b7c'
              }}
            />
          </div>
        </div>

        {/* Disposition Filter */}
        <div className="filter-group">
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: '#6b6b7c',
            marginBottom: 6
          }}>
            <Check size={14} />
            Disposition
          </label>
          <div style={{ position: 'relative' }}>
            <select
              value={value.disposition || ''}
              onChange={(e) => handleFilterChange('disposition', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 32px 8px 12px',
                background: 'rgba(10, 10, 15, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 6,
                color: '#ffffff',
                fontSize: 13,
                appearance: 'none',
                cursor: 'pointer'
              }}
            >
              {DISPOSITIONS.map((disp) => (
                <option key={disp.value} value={disp.value}>
                  {disp.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: '#6b6b7c'
              }}
            />
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="filter-group">
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: '#6b6b7c',
            marginBottom: 6
          }}>
            <Calendar size={14} />
            Date Range
          </label>
          <div style={{ position: 'relative' }}>
            <select
              value={value.dateRange || ''}
              onChange={(e) => handleFilterChange('dateRange', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 32px 8px 12px',
                background: 'rgba(10, 10, 15, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 6,
                color: '#ffffff',
                fontSize: 13,
                appearance: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">All Time</option>
              {DATE_RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: '#6b6b7c'
              }}
            />
          </div>
        </div>
      </div>

      {/* Custom Date Pickers */}
      {showDatePickers && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginTop: 12,
          padding: 12,
          background: 'rgba(10, 10, 15, 0.4)',
          borderRadius: 8
        }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: 11,
              color: '#6b6b7c',
              marginBottom: 4
            }}>
              From Date
            </label>
            <input
              type="date"
              value={value.from || ''}
              onChange={(e) => handleFilterChange('from', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(10, 10, 15, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 6,
                color: '#ffffff',
                fontSize: 13
              }}
            />
          </div>
          <div>
            <label style={{
              display: 'block',
              fontSize: 11,
              color: '#6b6b7c',
              marginBottom: 4
            }}>
              To Date
            </label>
            <input
              type="date"
              value={value.to || ''}
              onChange={(e) => handleFilterChange('to', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(10, 10, 15, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 6,
                color: '#ffffff',
                fontSize: 13
              }}
            />
          </div>
        </div>
      )}

      <style jsx>{`
        select:focus,
        input:focus {
          outline: none;
          border-color: rgba(124, 58, 237, 0.5) !important;
          box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.1);
        }

        select option {
          background: #1a1a1f;
          color: #ffffff;
        }

        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.6);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}