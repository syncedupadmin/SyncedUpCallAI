'use client';

import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UserAgency {
  agency_id: string;
  agency_name: string;
  role: 'admin' | 'member';
  joined_at: string;
}

interface AgencyContextValue {
  agencies: UserAgency[];
  selectedAgencyId: string | null;
  setSelectedAgencyId: (id: string | null) => void;
  loading: boolean;
  error: string | null;
  refreshAgencies: () => Promise<void>;
}

const AgencyContext = createContext<AgencyContextValue | null>(null);

export function AgencyProvider({ children }: { children: ReactNode }) {
  const [agencies, setAgencies] = useState<UserAgency[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(() => {
    // Try to restore from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app:selectedAgencyId');
      return saved || null;
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchUserAgencies = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current user's agency memberships
      const { data: memberships, error: membershipsError } = await supabase
        .from('user_agencies')
        .select(`
          agency_id,
          role,
          created_at,
          agencies!inner(
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (membershipsError) {
        throw membershipsError;
      }

      // Transform the data
      const userAgencies: UserAgency[] = (memberships || []).map((membership: any) => ({
        agency_id: membership.agency_id,
        agency_name: membership.agencies.name,
        role: membership.role,
        joined_at: membership.created_at,
      }));

      setAgencies(userAgencies);

      // Auto-select first agency if none selected or if selected agency is no longer valid
      const agencyIds = new Set(userAgencies.map(a => a.agency_id));
      if (!selectedAgencyId || !agencyIds.has(selectedAgencyId)) {
        const firstAgencyId = userAgencies[0]?.agency_id || null;
        setSelectedAgencyId(firstAgencyId);
        if (firstAgencyId) {
          localStorage.setItem('app:selectedAgencyId', firstAgencyId);
        } else {
          localStorage.removeItem('app:selectedAgencyId');
        }
      }
    } catch (err) {
      console.error('Error fetching user agencies:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agencies');
    } finally {
      setLoading(false);
    }
  };

  // Fetch agencies on mount
  useEffect(() => {
    fetchUserAgencies();
  }, []);

  // Persist selected agency to localStorage
  useEffect(() => {
    if (selectedAgencyId) {
      localStorage.setItem('app:selectedAgencyId', selectedAgencyId);
    } else {
      localStorage.removeItem('app:selectedAgencyId');
    }
  }, [selectedAgencyId]);

  const value = useMemo(
    () => ({
      agencies,
      selectedAgencyId,
      setSelectedAgencyId,
      loading,
      error,
      refreshAgencies: fetchUserAgencies,
    }),
    [agencies, selectedAgencyId, loading, error]
  );

  return <AgencyContext.Provider value={value}>{children}</AgencyContext.Provider>;
}

export function useAgencyContext() {
  const ctx = useContext(AgencyContext);
  if (!ctx) {
    throw new Error('useAgencyContext must be used within AgencyProvider');
  }
  return ctx;
}

export function useRequiredAgencyId() {
  const { selectedAgencyId } = useAgencyContext();
  if (!selectedAgencyId) {
    throw new Error('No agency selected. Ensure AgencyProvider is mounted and an agency is chosen.');
  }
  return selectedAgencyId;
}

export function useCurrentAgency() {
  const { agencies, selectedAgencyId } = useAgencyContext();
  return agencies.find(agency => agency.agency_id === selectedAgencyId) || null;
}