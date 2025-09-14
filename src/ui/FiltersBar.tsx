'use client';

import React, { useState } from 'react';
import { tokens } from './tokens';
import { Search, Calendar, Filter } from './icons';

export interface FilterOptions {
  search?: string;
  dateRange?: { start: Date | null; end: Date | null };
  [key: string]: any;
}

interface FiltersBarProps {
  onFiltersChange: (filters: FilterOptions) => void;
  children?: React.ReactNode;
  showSearch?: boolean;
  searchPlaceholder?: string;
}

export default function FiltersBar({
  onFiltersChange,
  children,
  showSearch = true,
  searchPlaceholder = 'Search...',
}: FiltersBarProps) {
  const [filters, setFilters] = useState<FilterOptions>({});

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: tokens.spacing.md,
        padding: tokens.spacing.md,
        background: tokens.colors.backgroundTertiary,
        borderRadius: tokens.radii.lg,
        border: `1px solid ${tokens.colors.border}`,
      }}
    >
      {showSearch && (
        <div style={{ flex: '1 1 300px', position: 'relative' }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: tokens.spacing.md,
              top: '50%',
              transform: 'translateY(-50%)',
              color: tokens.colors.textTertiary,
            }}
          />
          <input
            type="text"
            placeholder={searchPlaceholder}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            style={{
              width: '100%',
              padding: `${tokens.spacing.sm} ${tokens.spacing.sm} ${tokens.spacing.sm} 40px`,
              background: tokens.colors.backgroundSecondary,
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radii.md,
              color: tokens.colors.text,
              fontSize: tokens.typography.fontSize.md,
              outline: 'none',
              transition: `all ${tokens.transitions.fast}`,
            }}
            onFocus={(e) => {
              e.target.style.borderColor = tokens.colors.primary;
              e.target.style.boxShadow = `0 0 0 2px ${tokens.colors.primary}20`;
            }}
            onBlur={(e) => {
              e.target.style.borderColor = tokens.colors.border;
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>
      )}
      {children}
    </div>
  );
}

// Export helper components for common filter types
export function SelectFilter({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select...',
}: {
  label?: string;
  options: { value: string; label: string }[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.xs }}>
      {label && (
        <label
          style={{
            fontSize: tokens.typography.fontSize.xs,
            color: tokens.colors.textTertiary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {label}
        </label>
      )}
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
          background: tokens.colors.backgroundSecondary,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.radii.md,
          color: tokens.colors.text,
          fontSize: tokens.typography.fontSize.md,
          cursor: 'pointer',
          outline: 'none',
          minWidth: '150px',
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
}: {
  startDate?: string;
  endDate?: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing.sm }}>
      <Calendar size={18} style={{ color: tokens.colors.textTertiary }} />
      <input
        type="date"
        value={startDate || ''}
        onChange={(e) => onStartChange(e.target.value)}
        style={{
          padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
          background: tokens.colors.backgroundSecondary,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.radii.md,
          color: tokens.colors.text,
          fontSize: tokens.typography.fontSize.sm,
          outline: 'none',
        }}
      />
      <span style={{ color: tokens.colors.textTertiary }}>to</span>
      <input
        type="date"
        value={endDate || ''}
        onChange={(e) => onEndChange(e.target.value)}
        style={{
          padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
          background: tokens.colors.backgroundSecondary,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.radii.md,
          color: tokens.colors.text,
          fontSize: tokens.typography.fontSize.sm,
          outline: 'none',
        }}
      />
    </div>
  );
}