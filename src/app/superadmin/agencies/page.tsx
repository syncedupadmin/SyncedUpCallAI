/**
 * Super Admin Agencies Management Page
 *
 * Environment Variables Required:
 * - NEXT_PUBLIC_SUPABASE_URL: Your Supabase project URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY: Your Supabase anon/public key
 *
 * Testing Locally:
 * 1. Ensure you have the above environment variables set in .env.local
 * 2. Ensure you're authenticated (sign in first)
 * 3. Navigate to /superadmin/agencies
 * 4. Test creating agencies with the form
 * 5. Test search, pagination, and copy ID functionality
 * 6. Test delete (if RLS allows)
 *
 * Database Requirements:
 * - Table: public.agencies with columns as specified
 * - RPC function: create_agency_with_owner
 * - RLS policies properly configured for authenticated users
 */

import { getInitialAgencies } from './actions'
import { AgencyCreateCard } from './AgencyCreateCard'
import { AgenciesTable } from './AgenciesTable'
import { ClientWrapper } from './ClientWrapper'

export default async function AgenciesPage() {
  const { agencies, count } = await getInitialAgencies()

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Agencies Management</h1>
        <p className="text-muted-foreground mt-2">
          Create and manage agencies in your system
        </p>
      </div>

      <ClientWrapper initialData={agencies} initialCount={count} />
    </div>
  )
}