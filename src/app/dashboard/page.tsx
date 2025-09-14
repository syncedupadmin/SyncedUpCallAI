'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/src/ui/StatCard';
import EmptyState from '@/src/ui/EmptyState';
import Badge from '@/src/ui/Badge';
import { tokens } from '@/src/ui/tokens';
import {
  Phone,
  Clock,
  TrendingUp,
  Users,
  Activity,
  BarChart3,
  Calendar,
  CheckCircle
} from '@/src/ui/icons';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState({
    totalCalls: 0,
    avgDuration: '0s',
    successRate: 0,
    activeAgents: 0,
    weekChange: 0,
    todayCalls: 0
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  const fetchStats = () => {
    setStatsLoading(true);
    fetch('/api/ui/stats/safe')
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.metrics) {
          setMetrics(data.metrics);
        }
        setStatsLoading(false);
      })
      .catch(() => {
        setStatsLoading(false);
      });
  };

  const fetchRecentActivity = () => {
    setActivityLoading(true);
    fetch('/api/ui/calls?limit=5&offset=0')
      .then(res => res.json())
      .then(data => {
        setRecentActivity(data.data || []);
        setActivityLoading(false);
      })
      .catch(() => {
        setRecentActivity([]);
        setActivityLoading(false);
      });
  };

  useEffect(() => {
    fetchStats();
    fetchRecentActivity();

    // Refresh stats every 30 seconds
    const interval = setInterval(() => {
      fetchStats();
      fetchRecentActivity();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
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
          Dashboard
        </h1>
        <p style={{
          color: tokens.colors.textSecondary,
          fontSize: tokens.typography.fontSize.md
        }}>
          Real-time overview of your call center operations
        </p>
      </div>

      {/* Metrics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: tokens.spacing.lg,
        marginBottom: tokens.spacing['3xl']
      }}>
        <StatCard
          title="Total Calls"
          value={statsLoading ? '...' : metrics.totalCalls.toLocaleString()}
          trend={metrics.weekChange !== 0 ? {
            value: Math.abs(metrics.weekChange),
            isPositive: metrics.weekChange >= 0
          } : undefined}
          icon={<Phone size={24} />}
          loading={statsLoading}
        />

        <StatCard
          title="Average Duration"
          value={statsLoading ? '...' : metrics.avgDuration}
          icon={<Clock size={24} />}
          loading={statsLoading}
        />

        <StatCard
          title="Success Rate"
          value={statsLoading ? '...' : `${metrics.successRate}%`}
          icon={<CheckCircle size={24} />}
          loading={statsLoading}
        />

        <StatCard
          title="Active Agents (24h)"
          value={statsLoading ? '...' : metrics.activeAgents.toString()}
          icon={<Users size={24} />}
          loading={statsLoading}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: tokens.spacing.lg
      }}>
        {/* Performance Chart Placeholder */}
        <div style={{
          background: tokens.colors.backgroundSecondary,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.radii.lg,
          padding: tokens.spacing.xl
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing.md,
            marginBottom: tokens.spacing.xl
          }}>
            <BarChart3 size={20} style={{ color: tokens.colors.primary }} />
            <h2 style={{
              fontSize: tokens.typography.fontSize.lg,
              fontWeight: tokens.typography.fontWeight.semibold,
              color: tokens.colors.text
            }}>
              Call Volume Trends
            </h2>
          </div>

          <div style={{
            height: '200px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: tokens.colors.backgroundTertiary,
            borderRadius: tokens.radii.md,
            color: tokens.colors.textTertiary
          }}>
            <div style={{ textAlign: 'center' }}>
              <BarChart3 size={48} style={{ opacity: 0.3, marginBottom: tokens.spacing.md }} />
              <p style={{ fontSize: tokens.typography.fontSize.sm }}>
                Chart visualization coming soon
              </p>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{
          background: tokens.colors.backgroundSecondary,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.radii.lg,
          padding: tokens.spacing.xl
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: tokens.spacing.xl
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: tokens.spacing.md
            }}>
              <Activity size={20} style={{ color: tokens.colors.primary }} />
              <h2 style={{
                fontSize: tokens.typography.fontSize.lg,
                fontWeight: tokens.typography.fontWeight.semibold,
                color: tokens.colors.text
              }}>
                Recent Activity
              </h2>
            </div>
            <a
              href="/calls"
              style={{
                fontSize: tokens.typography.fontSize.sm,
                color: tokens.colors.primary,
                textDecoration: 'none'
              }}
            >
              View all →
            </a>
          </div>

          {activityLoading ? (
            <div style={{
              padding: tokens.spacing.xl,
              textAlign: 'center',
              color: tokens.colors.textTertiary
            }}>
              Loading activity...
            </div>
          ) : recentActivity.length === 0 ? (
            <EmptyState
              icon={<Phone size={48} />}
              title="No recent calls"
              subtitle="Call activity will appear here"
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.md }}>
              {recentActivity.map((call: any) => (
                <a
                  key={call.id}
                  href={`/call/${call.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: tokens.spacing.md,
                    background: tokens.colors.backgroundTertiary,
                    borderRadius: tokens.radii.md,
                    border: `1px solid ${tokens.colors.border}`,
                    textDecoration: 'none',
                    transition: `all ${tokens.transitions.fast}`,
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = tokens.colors.primary;
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = tokens.colors.border;
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.xs }}>
                    <div style={{
                      fontSize: tokens.typography.fontSize.sm,
                      color: tokens.colors.text,
                      fontWeight: tokens.typography.fontWeight.medium
                    }}>
                      {call.agent_name || 'Unknown Agent'}
                    </div>
                    <div style={{
                      fontSize: tokens.typography.fontSize.xs,
                      color: tokens.colors.textTertiary
                    }}>
                      {formatDuration(call.duration || 0)} • {new Date(call.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <Badge variant={call.status === 'done' ? 'success' : 'info'} size="sm">
                    {call.status || 'pending'}
                  </Badge>
                </a>
              ))}
            </div>
          )}
        </div>
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
          background: tokens.colors.success,
          animation: 'pulse 2s infinite'
        }} />
        <span>System Online</span>
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