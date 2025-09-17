import { createClient } from '@/src/lib/supabase/server';
import { NextRequest } from 'next/server';

/**
 * Check if the current user is a super admin using the database is_super_admin() function
 */
export async function isUserAdmin(userId?: string): Promise<boolean> {
  try {
    const supabase = await createClient();

    // Use the database is_super_admin() function for canonical admin check
    const { data, error } = await supabase.rpc('is_super_admin');

    if (error) {
      console.error('Error checking admin status:', error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Get the current user from Supabase auth
 */
export async function getCurrentUser() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    // Get the user's profile with role
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return {
      ...user,
      role: profile?.role || 'user'
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Check if the current request is from a super admin user
 */
export async function isAdminRequest(): Promise<boolean> {
  try {
    const supabase = await createClient();

    // Use the database is_super_admin() function for canonical admin check
    const { data, error } = await supabase.rpc('is_super_admin');

    if (error) {
      console.error('Error checking admin request:', error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error('Error checking admin request:', error);
    return false;
  }
}