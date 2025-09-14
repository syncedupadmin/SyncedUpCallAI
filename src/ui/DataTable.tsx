'use client';

import React from 'react';
import { tokens } from './tokens';
import { ChevronLeft, ChevronRight } from './icons';

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export default function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyMessage = 'No data available',
  currentPage = 1,
  totalPages = 1,
  onPageChange,
}: DataTableProps<T>) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{
                    padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
                    fontSize: tokens.typography.fontSize.xs,
                    fontWeight: tokens.typography.fontWeight.semibold,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: tokens.colors.textTertiary,
                    textAlign: column.align || 'left',
                    borderBottom: `1px solid ${tokens.colors.border}`,
                    width: column.width,
                  }}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: tokens.spacing['3xl'],
                    textAlign: 'center',
                    color: tokens.colors.textTertiary,
                  }}
                >
                  <div className="pulse">Loading...</div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    padding: tokens.spacing['3xl'],
                    textAlign: 'center',
                    color: tokens.colors.textTertiary,
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  style={{
                    transition: `background ${tokens.transitions.fast}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = tokens.colors.backgroundTertiary;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      style={{
                        padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
                        fontSize: tokens.typography.fontSize.md,
                        color: tokens.colors.text,
                        textAlign: column.align || 'left',
                        borderBottom: `1px solid ${tokens.colors.border}`,
                      }}
                    >
                      {column.render
                        ? column.render(row)
                        : (row as any)[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
            borderTop: `1px solid ${tokens.colors.border}`,
          }}
        >
          <div style={{ fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textSecondary }}>
            Page {currentPage} of {totalPages}
          </div>
          <div style={{ display: 'flex', gap: tokens.spacing.sm }}>
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.spacing.xs,
                padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
                background: tokens.colors.backgroundTertiary,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: tokens.radii.md,
                color: currentPage === 1 ? tokens.colors.textTertiary : tokens.colors.text,
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1,
                transition: `all ${tokens.transitions.fast}`,
              }}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.spacing.xs,
                padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
                background: tokens.colors.backgroundTertiary,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: tokens.radii.md,
                color: currentPage === totalPages ? tokens.colors.textTertiary : tokens.colors.text,
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.5 : 1,
                transition: `all ${tokens.transitions.fast}`,
              }}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}