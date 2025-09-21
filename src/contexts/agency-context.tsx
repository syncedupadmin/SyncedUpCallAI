'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import Cookies from 'js-cookie';

interface Agency {
  id: string;
  name: string;
  slug?: string;
}

interface UserAgency {
  agency_id: string;
  role: string;
  agency: Agency;
}

interface AgencyContextType {
  currentAgencyId: string | null;
  agencies: UserAgency[];
  loading: boolean;
  setAgency: (agencyId: string) => void;
  refreshAgencies: () => Promise<void>;
}

const AgencyContext = createContext<AgencyContextType | undefined>(undefined);

export function AgencyProvider({ children }: { children: ReactNode }) {
  const [currentAgencyId, setCurrentAgencyId] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<UserAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Load agencies for the current user
  const loadAgencies = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setAgencies([]);
        setCurrentAgencyId(null);
        setLoading(false);
        return;
      }

      // Fetch user's agency memberships
      const { data, error } = await supabase
        .from('user_agencies')
        .select(`
          agency_id,
          role,
          agency:agencies(id, name, slug)
        `)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching agencies:', error);
        setAgencies([]);
        setLoading(false);
        return;
      }

      const userAgencies = ((data || []) as any[])
        .filter(ua => ua.agency)
        .map(ua => ({
          agency_id: ua.agency_id,
          role: ua.role,
          agency: ua.agency
        })) as UserAgency[];
      setAgencies(userAgencies);

      // Get stored agency ID from cookie
      const storedAgencyId = Cookies.get('agency_id');

      // Validate stored agency ID or select first available
      if (storedAgencyId && userAgencies.some(ua => ua.agency_id === storedAgencyId)) {
        setCurrentAgencyId(storedAgencyId);
      } else if (userAgencies.length > 0) {
        // Auto-select first agency if only one or no stored preference
        const firstAgencyId = userAgencies[0].agency_id;
        setCurrentAgencyId(firstAgencyId);
        Cookies.set('agency_id', firstAgencyId, { expires: 365 });
      } else {
        setCurrentAgencyId(null);
      }
    } catch (error) {
      console.error('Error in loadAgencies:', error);
      setAgencies([]);
    } finally {
      setLoading(false);
    }
  };

  // Set the current agency
  const setAgency = (agencyId: string) => {
    // Validate that user has access to this agency
    if (!agencies.some(ua => ua.agency_id === agencyId)) {
      console.error('User does not have access to this agency');
      return;
    }

    setCurrentAgencyId(agencyId);
    Cookies.set('agency_id', agencyId, { expires: 365 });
  };

  // Refresh agencies list
  const refreshAgencies = async () => {
    setLoading(true);
    await loadAgencies();
  };

  // Load agencies on mount and when auth changes
  useEffect(() => {
    loadAgencies();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadAgencies();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AgencyContext.Provider value={{
      currentAgencyId,
      agencies,
      loading,
      setAgency,
      refreshAgencies,
    }}>
      {children}
    </AgencyContext.Provider>
  );
}

export function useAgency() {
  const context = useContext(AgencyContext);
  if (context === undefined) {
    throw new Error('useAgency must be used within an AgencyProvider');
  }
  return context;
}

// Hook to get the current agency details
export function useCurrentAgency() {
  const { currentAgencyId, agencies } = useAgency();
  return agencies.find(ua => ua.agency_id === currentAgencyId);
}

// Hook to check if user has multiple agencies
export function useHasMultipleAgencies() {
  const { agencies } = useAgency();
  return agencies.length > 1;
}