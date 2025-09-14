'use client';

import React from 'react';
import { tokens } from './tokens';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  success: {
    background: `${tokens.colors.success}20`,
    color: tokens.colors.success,
    border: `1px solid ${tokens.colors.success}40`,
  },
  warning: {
    background: `${tokens.colors.warning}20`,
    color: tokens.colors.warning,
    border: `1px solid ${tokens.colors.warning}40`,
  },
  danger: {
    background: `${tokens.colors.danger}20`,
    color: tokens.colors.danger,
    border: `1px solid ${tokens.colors.danger}40`,
  },
  info: {
    background: `${tokens.colors.info}20`,
    color: tokens.colors.info,
    border: `1px solid ${tokens.colors.info}40`,
  },
  neutral: {
    background: tokens.colors.gray[800],
    color: tokens.colors.textSecondary,
    border: `1px solid ${tokens.colors.border}`,
  },
};

export default function Badge({
  children,
  variant = 'neutral',
  size = 'md'
}: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: size === 'sm' ? '2px 8px' : '4px 12px',
        borderRadius: tokens.radii.full,
        fontSize: size === 'sm' ? tokens.typography.fontSize.xs : tokens.typography.fontSize.sm,
        fontWeight: tokens.typography.fontWeight.medium,
        transition: `all ${tokens.transitions.fast}`,
        ...variantStyles[variant],
      }}
    >
      {children}
    </span>
  );
}