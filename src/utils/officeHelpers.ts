import { createClient } from '@/src/lib/supabase/client';

const supabase = createClient();

type OfficeScoped = { office_id: number };

/**
 * Helper to insert data with office_id
 * Ensures office_id is always included in tenant-scoped inserts
 */
export async function officeInsert<T extends object>(
  table: string,
  row: T,
  officeId: number
) {
  const payload = { ...row, office_id: officeId } as T & OfficeScoped;
  return supabase.from(table).insert([payload]);
}

/**
 * Helper to query data scoped by office
 * Adds office_id filter for non-super users
 */
export function getOfficeScopedQuery(
  table: string,
  officeId: number | null,
  isSuper: boolean = false
) {
  let query = supabase.from(table).select('*');

  // Super admins see all data, others see office-scoped
  if (!isSuper && officeId) {
    query = query.eq('office_id', officeId);
  }

  return query;
}

/**
 * Helper to batch update office_id for multiple records
 * Useful during migration
 */
export async function assignRecordsToOffice(
  table: string,
  recordIds: string[] | number[],
  officeId: number
) {
  return supabase
    .from(table)
    .update({ office_id: officeId })
    .in('id', recordIds);
}