'use client';

import React from 'react';
import { tokens } from './tokens';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'ghost' | 'primary';
  size?: 'sm' | 'md' | 'lg';
  'aria-label': string; // Required for accessibility
}

export default function IconButton({
  children,
  variant = 'ghost',
  size = 'md',
  disabled,
  ...props
}: IconButtonProps) {
  const sizeStyles = {
    sm: { padding: tokens.spacing.xs, width: 28, height: 28 },
    md: { padding: tokens.spacing.sm, width: 36, height: 36 },
    lg: { padding: '10px', width: 44, height: 44 },
  };

  const variantStyles = {
    ghost: {
      background: 'transparent',
      color: tokens.colors.textSecondary,
      border: `1px solid transparent`,
      '&:hover': {
        background: tokens.colors.backgroundTertiary,
        borderColor: tokens.colors.border,
      },
    },
    primary: {
      background: tokens.colors.primary,
      color: tokens.colors.background,
      border: `1px solid ${tokens.colors.primary}`,
      '&:hover': {
        background: tokens.colors.primaryDark,
      },
    },
  };

  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: tokens.radii.md,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: `all ${tokens.transitions.fast}`,
        outline: 'none',
        ...sizeStyles[size],
        ...(variant === 'ghost' ? {
          background: 'transparent',
          color: tokens.colors.textSecondary,
          border: `1px solid transparent`,
        } : {
          background: tokens.colors.primary,
          color: tokens.colors.background,
          border: `1px solid ${tokens.colors.primary}`,
        }),
        ...props.style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          if (variant === 'ghost') {
            e.currentTarget.style.background = tokens.colors.backgroundTertiary;
            e.currentTarget.style.borderColor = tokens.colors.border;
          } else {
            e.currentTarget.style.background = tokens.colors.primaryDark;
          }
        }
        props.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          if (variant === 'ghost') {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'transparent';
          } else {
            e.currentTarget.style.background = tokens.colors.primary;
          }
        }
        props.onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 2px ${tokens.colors.primary}40`;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        props.onBlur?.(e);
      }}
    >
      {children}
    </button>
  );
}