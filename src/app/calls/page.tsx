'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import DataTable, { Column } from '@/src/ui/DataTable';
import FiltersBar, { SelectFilter, DateRangeFilter } from '@/src/ui/FiltersBar';
import StatCard from '@/src/ui/StatCard';
import Badge from '@/src/ui/Badge';
import IconButton from '@/src/ui/IconButton';
import { tokens } from '@/src/ui/tokens';
import {
  Phone,
  Clock,
  CheckCircle,
  Activity,
  Eye,
  Play,
  Download,
  Filter
} from '@/src/ui/icons';

interface CallRow {
  id: string;
  started_at: string;
  agent: string;
  primary_phone: string;
  disposition: string;
  reason_primary: string;
  duration_sec: number;
  summary: string;
  recording_url?: string;
  status?: string;
}

export default function CallsPage() {
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<any>({});
  const [stats, setStats] = useState({
    totalCalls: 0,
    todayCalls: 0,
    avgDuration: '0s',
    successRate: 0
  });
  const limit = 20;

  // Build query string with filters
  const queryParams = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
    ...(filters.search && { search: filters.search }),
    ...(filters.disposition && { disposition: filters.disposition }),
    ...(filters.dateStart && { dateStart: filters.dateStart }),
    ...(filters.dateEnd && { dateEnd: filters.dateEnd })
  });

  const { data, isLoading } = useSWR(
    `/api/ui/calls?${queryParams}`,
    u => fetch(u).then(r => r.json())
  );

  const rows = data?.data || [];
  const total = data?.total || 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  // Fetch stats
  useEffect(() => {
    fetch('/api/ui/stats/safe')
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.metrics) {
          setStats({
            totalCalls: data.metrics.totalCalls || 0,
            todayCalls: data.metrics.todayCalls || 0,
            avgDuration: data.metrics.avgDuration || '0s',
            successRate: data.metrics.successRate || 0
          });
        }
      })
      .catch(() => {});
  }, []);

  const formatDuration = (seconds: number) => {
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const columns: Column<CallRow>[] = [
    {
      key: 'started_at',
      header: 'Date & Time',
      width: '180px',
      render: (row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 500, fontSize: tokens.typography.fontSize.sm }}>
            {row.started_at ? new Date(row.started_at).toLocaleDateString() : '—'}
          </span>
          <span style={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textTertiary }}>
            {row.started_at ? new Date(row.started_at).toLocaleTimeString() : '—'}
          </span>
        </div>
      )
    },
    {
      key: 'agent',
      header: 'Agent',
      width: '200px',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing.sm }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${tokens.colors.primary}, ${tokens.colors.secondary})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: tokens.typography.fontSize.sm,
            fontWeight: tokens.typography.fontWeight.semibold,
            color: tokens.colors.background
          }}>
            {(row.agent || 'A')[0].toUpperCase()}
          </div>
          <span>{row.agent || 'Unknown'}</span>
        </div>
      )
    },
    {
      key: 'primary_phone',
      header: 'Customer',
      width: '150px',
      render: (row) => row.primary_phone ? (
        <a
          href={`/journey/${row.primary_phone.replace(/\D/g, '')}`}
          style={{
            color: tokens.colors.primary,
            textDecoration: 'none',
            fontFamily: 'monospace',
            fontSize: tokens.typography.fontSize.sm
          }}
          title="View customer journey"
        >
          {row.primary_phone}
        </a>
      ) : (
        <span style={{ color: tokens.colors.textTertiary }}>—</span>
      )
    },
    {
      key: 'disposition',
      header: 'Status',
      width: '120px',
      render: (row) => {
        if (!row.disposition) return <span style={{ color: tokens.colors.textTertiary }}>—</span>;

        const variantMap: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
          'Completed': 'success',
          'No Answer': 'warning',
          'Busy': 'danger',
          'Failed': 'danger',
          'Voicemail': 'info'
        };

        return (
          <Badge variant={variantMap[row.disposition] || 'neutral'} size="sm">
            {row.disposition}
          </Badge>
        );
      }
    },
    {
      key: 'reason_primary',
      header: 'Reason',
      width: '150px',
      render: (row) => (
        <span style={{ fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textSecondary }}>
          {row.reason_primary || '—'}
        </span>
      )
    },
    {
      key: 'duration_sec',
      header: 'Duration',
      width: '100px',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing.xs }}>
          <Clock size={14} style={{ opacity: 0.5 }} />
          <span style={{ fontWeight: 500 }}>
            {formatDuration(row.duration_sec)}
          </span>
        </div>
      )
    },
    {
      key: 'summary',
      header: 'Summary',
      render: (row) => (
        <div style={{
          fontSize: tokens.typography.fontSize.sm,
          color: tokens.colors.textSecondary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }} title={row.summary || ''}>
          {row.summary || '—'}
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '120px',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'flex', gap: tokens.spacing.xs, justifyContent: 'flex-end' }}>
          <a href={`/call/${row.id}`}>
            <IconButton size="sm" aria-label="View call details">
              <Eye size={16} />
            </IconButton>
          </a>
          {row.recording_url && (
            <a href={row.recording_url} target="_blank" rel="noopener noreferrer">
              <IconButton size="sm" variant="primary" aria-label="Play recording">
                <Play size={16} />
              </IconButton>
            </a>
          )}
        </div>
      )
    }
  ];

  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters);
    setOffset(0); // Reset to first page when filters change
  };

  const handlePageChange = (page: number) => {
    setOffset((page - 1) * limit);
  };

  return (
    <div style={{ padding: tokens.spacing['3xl'], maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: tokens.spacing['3xl'] }}>
        <h1 style={{
          fontSize: tokens.typography.fontSize['3xl'],
          fontWeight: tokens.typography.fontWeight.bold,
          color: tokens.colors.text,
          marginBottom: tokens.spacing.sm
        }}>
          Call Management
        </h1>
        <p style={{
          color: tokens.colors.textSecondary,
          fontSize: tokens.typography.fontSize.md
        }}>
          Monitor and analyze all call activity across your organization
        </p>
      </div>

      {/* Quick Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: tokens.spacing.lg,
        marginBottom: tokens.spacing['2xl']
      }}>
        <StatCard
          title="Total Calls"
          value={stats.totalCalls.toLocaleString()}
          icon={<Phone size={20} />}
        />
        <StatCard
          title="Today's Calls"
          value={stats.todayCalls.toString()}
          icon={<Activity size={20} />}
        />
        <StatCard
          title="Average Duration"
          value={stats.avgDuration}
          icon={<Clock size={20} />}
        />
        <StatCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          icon={<CheckCircle size={20} />}
        />
      </div>

      {/* Filters */}
      <div style={{ marginBottom: tokens.spacing.lg }}>
        <FiltersBar
          onFiltersChange={handleFiltersChange}
          searchPlaceholder="Search by agent, phone, or summary..."
        >
          <SelectFilter
            label="Status"
            options={[
              { value: 'Completed', label: 'Completed' },
              { value: 'No Answer', label: 'No Answer' },
              { value: 'Busy', label: 'Busy' },
              { value: 'Failed', label: 'Failed' },
              { value: 'Voicemail', label: 'Voicemail' }
            ]}
            value={filters.disposition}
            onChange={(value) => handleFiltersChange({ ...filters, disposition: value })}
            placeholder="All statuses"
          />
          <DateRangeFilter
            startDate={filters.dateStart}
            endDate={filters.dateEnd}
            onStartChange={(date) => handleFiltersChange({ ...filters, dateStart: date })}
            onEndChange={(date) => handleFiltersChange({ ...filters, dateEnd: date })}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: tokens.spacing.sm }}>
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.spacing.xs,
                padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
                background: tokens.colors.backgroundSecondary,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: tokens.radii.md,
                color: tokens.colors.text,
                fontSize: tokens.typography.fontSize.sm,
                cursor: 'pointer',
                transition: `all ${tokens.transitions.fast}`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.border;
              }}
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </FiltersBar>
      </div>

      {/* Main Table */}
      <div style={{
        background: tokens.colors.backgroundSecondary,
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radii.lg,
        overflow: 'hidden'
      }}>
        <DataTable
          columns={columns}
          data={rows}
          keyExtractor={(row) => row.id}
          loading={isLoading}
          emptyMessage="No calls found. Calls will appear here as they are processed."
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>

      {/* Live Status Indicator */}
      <div style={{
        position: 'fixed',
        bottom: tokens.spacing.lg,
        right: tokens.spacing.lg,
        padding: `${tokens.spacing.sm} ${tokens.spacing.lg}`,
        background: tokens.colors.backgroundSecondary,
        backdropFilter: 'blur(10px)',
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radii.full,
        display: 'flex',
        alignItems: 'center',
        gap: tokens.spacing.sm,
        fontSize: tokens.typography.fontSize.sm,
        color: tokens.colors.textSecondary,
        boxShadow: tokens.shadows.lg
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: tokens.colors.info,
          animation: 'pulse 2s infinite'
        }} />
        <span>Live Updates</span>
        <span style={{ color: tokens.colors.info, fontWeight: tokens.typography.fontWeight.semibold }}>
          {total} Total Calls
        </span>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}