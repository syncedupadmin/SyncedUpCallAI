'use client';

import React from 'react';
import { tokens } from './tokens';

export interface Tab {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  variant?: 'default' | 'pills';
}

export default function Tabs({
  tabs,
  activeTab,
  onTabChange,
  variant = 'default'
}: TabsProps) {
  if (variant === 'pills') {
    return (
      <div style={{
        display: 'flex',
        gap: tokens.spacing.sm,
        padding: tokens.spacing.xs,
        background: tokens.colors.backgroundTertiary,
        borderRadius: tokens.radii.lg
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{
              flex: 1,
              padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
              background: activeTab === tab.key ? tokens.colors.backgroundSecondary : 'transparent',
              border: `1px solid ${activeTab === tab.key ? tokens.colors.border : 'transparent'}`,
              borderRadius: tokens.radii.md,
              color: activeTab === tab.key ? tokens.colors.text : tokens.colors.textSecondary,
              fontSize: tokens.typography.fontSize.sm,
              fontWeight: activeTab === tab.key ? tokens.typography.fontWeight.medium : tokens.typography.fontWeight.normal,
              cursor: 'pointer',
              transition: `all ${tokens.transitions.fast}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: tokens.spacing.sm
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      gap: tokens.spacing.xs,
      borderBottom: `1px solid ${tokens.colors.border}`,
      marginBottom: tokens.spacing.lg
    }}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          style={{
            padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === tab.key ? `2px solid ${tokens.colors.primary}` : '2px solid transparent',
            color: activeTab === tab.key ? tokens.colors.text : tokens.colors.textSecondary,
            fontSize: tokens.typography.fontSize.sm,
            fontWeight: activeTab === tab.key ? tokens.typography.fontWeight.medium : tokens.typography.fontWeight.normal,
            cursor: 'pointer',
            transition: `all ${tokens.transitions.fast}`,
            marginBottom: '-1px',
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing.sm
          }}
          onMouseEnter={(e) => {
            if (activeTab !== tab.key) {
              e.currentTarget.style.color = tokens.colors.text;
              e.currentTarget.style.background = tokens.colors.backgroundTertiary;
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== tab.key) {
              e.currentTarget.style.color = tokens.colors.textSecondary;
              e.currentTarget.style.background = 'transparent';
            }
          }}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}