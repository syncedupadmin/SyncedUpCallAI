'use client';

import React from 'react';
import { tokens } from './tokens';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${tokens.spacing['3xl']} ${tokens.spacing.xl}`,
        textAlign: 'center',
      }}
    >
      {icon && (
        <div
          style={{
            color: tokens.colors.textTertiary,
            marginBottom: tokens.spacing.lg,
            opacity: 0.5,
          }}
        >
          {icon}
        </div>
      )}

      <h3
        style={{
          fontSize: tokens.typography.fontSize.xl,
          fontWeight: tokens.typography.fontWeight.semibold,
          color: tokens.colors.text,
          marginBottom: tokens.spacing.sm,
        }}
      >
        {title}
      </h3>

      {subtitle && (
        <p
          style={{
            fontSize: tokens.typography.fontSize.md,
            color: tokens.colors.textSecondary,
            marginBottom: tokens.spacing.lg,
            maxWidth: '400px',
          }}
        >
          {subtitle}
        </p>
      )}

      {action && <div>{action}</div>}
    </div>
  );
}