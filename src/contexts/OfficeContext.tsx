'use client';

import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { useMyMemberships } from '@/hooks/useOffice';

interface MyMembership {
  office_id: number;
  office_name: string;
  role: 'admin' | 'agent';
  joined_at: string;
}

interface OfficeContextValue {
  memberships: MyMembership[];
  selectedOfficeId: number | null;
  setSelectedOfficeId: (id: number | null) => void;
}

export const OfficeContext = createContext<OfficeContextValue | null>(null);

export function OfficeProvider({ children }: { children: ReactNode }) {
  const { data: memberships, loading } = useMyMemberships();
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Handle hydration and localStorage separately to avoid SSR mismatch
  useEffect(() => {
    if (!isHydrated) {
      const saved = localStorage.getItem('app:selectedOfficeId');
      if (saved) {
        setSelectedOfficeId(Number(saved));
      }
      setIsHydrated(true);
    }
  }, [isHydrated]);

  // Validate selection against memberships and persist
  useEffect(() => {
    if (loading) return;

    const officeIds = new Set((memberships || []).map((m) => m.office_id));
    let next = selectedOfficeId;

    if (!next || !officeIds.has(next)) {
      next = memberships?.[0]?.office_id ?? null;
    }

    setSelectedOfficeId(next);

    if (next) {
      localStorage.setItem('app:selectedOfficeId', String(next));
    } else {
      localStorage.removeItem('app:selectedOfficeId');
    }
  }, [loading, memberships, selectedOfficeId]);

  const value = useMemo(
    () => ({
      memberships: memberships || [],
      selectedOfficeId,
      setSelectedOfficeId
    }),
    [memberships, selectedOfficeId]
  );

  return <OfficeContext.Provider value={value}>{children}</OfficeContext.Provider>;
}

export function useOfficeContext() {
  const ctx = useContext(OfficeContext);
  if (!ctx) {
    throw new Error('useOfficeContext must be used within OfficeProvider');
  }
  return ctx;
}

export function useRequiredOfficeId() {
  const { selectedOfficeId } = useOfficeContext();
  if (!selectedOfficeId) {
    throw new Error('No office selected. Ensure OfficeProvider is mounted and an office is chosen.');
  }
  return selectedOfficeId;
}