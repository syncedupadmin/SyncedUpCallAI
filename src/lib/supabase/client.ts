import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Using the Supabase URL from the database connection
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sbvxvheirbjwfbqjreor.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  if (!supabaseAnonKey) {
    console.warn('Supabase Anon Key not configured - auth features will not work')
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  )
}