'use client';

import React from 'react';
import { tokens } from './tokens';
import { TrendingUp, TrendingDown } from './icons';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
  loading?: boolean;
}

export default function StatCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  loading = false,
}: StatCardProps) {
  return (
    <div
      style={{
        background: tokens.colors.backgroundTertiary,
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radii.lg,
        padding: tokens.spacing.lg,
        backdropFilter: 'blur(20px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: tokens.typography.fontSize.sm,
              color: tokens.colors.textTertiary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: tokens.spacing.sm,
              fontWeight: tokens.typography.fontWeight.medium,
            }}
          >
            {title}
          </div>

          <div
            style={{
              fontSize: tokens.typography.fontSize['2xl'],
              fontWeight: tokens.typography.fontWeight.bold,
              color: tokens.colors.text,
              marginBottom: tokens.spacing.xs,
            }}
          >
            {loading ? (
              <span className="pulse" style={{ color: tokens.colors.textTertiary }}>...</span>
            ) : (
              value
            )}
          </div>

          {subtitle && (
            <div
              style={{
                fontSize: tokens.typography.fontSize.sm,
                color: tokens.colors.textSecondary,
              }}
            >
              {subtitle}
            </div>
          )}

          {trend && !loading && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.spacing.xs,
                marginTop: tokens.spacing.sm,
                fontSize: tokens.typography.fontSize.sm,
                color: trend.isPositive ? tokens.colors.success : tokens.colors.danger,
              }}
            >
              {trend.isPositive ? (
                <TrendingUp size={16} />
              ) : (
                <TrendingDown size={16} />
              )}
              <span>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
            </div>
          )}
        </div>

        {icon && (
          <div
            style={{
              color: tokens.colors.primary,
              opacity: 0.8,
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}