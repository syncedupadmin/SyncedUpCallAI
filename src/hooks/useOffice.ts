import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/src/lib/supabase/client';

type OfficeRole = 'admin' | 'agent';

interface MyMembership {
  office_id: number;
  office_name: string;
  role: OfficeRole;
  joined_at: string;
}

interface OfficeUser {
  user_id: string;
  email?: string;
  name?: string;
  role: OfficeRole;
  office_role?: OfficeRole;
}

const supabase = createClient();

export function useMyMemberships() {
  const [data, setData] = useState<MyMembership[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMemberships = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('get_my_office_memberships');
      if (error) throw error;
      setData((data ?? []) as MyMembership[]);
    } catch (e: any) {
      setError(e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemberships();
  }, [fetchMemberships]);

  return { data, loading, error, refresh: fetchMemberships };
}

export function useOfficeUsers(officeId: number | null) {
  const [data, setData] = useState<OfficeUser[] | null>(null);
  const [loading, setLoading] = useState<boolean>(!!officeId);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!officeId) {
        setData([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc('get_users_by_level_with_office', {
          level_filter: 'all',
          office_filter: officeId,
        });
        if (error) throw error;
        if (!cancelled) setData((data ?? []) as OfficeUser[]);
      } catch (e: any) {
        if (!cancelled) {
          setError(e);
          setData([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [officeId]);

  return { data, loading, error };
}

export function useIsAgencyAdmin(officeId: number | null) {
  const { data: memberships, loading } = useMyMemberships();
  const isAdmin = !loading &&
    !!officeId &&
    !!memberships?.some((m) => m.office_id === officeId && m.role === 'admin');
  return { isAdmin, loading };
}