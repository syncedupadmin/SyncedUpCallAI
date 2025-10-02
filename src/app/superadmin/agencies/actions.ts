import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Agency } from './types'

export async function getInitialAgencies() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data, error, count } = await supabase
    .from('agencies')
    .select('id, name, slug, owner_user_id, created_at, updated_at, discovery_status', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, 24)

  if (error) {
    console.error('Error fetching agencies:', error)
    return { agencies: [], count: 0 }
  }

  return {
    agencies: (data as Agency[]) || [],
    count: count || 0,
  }
}