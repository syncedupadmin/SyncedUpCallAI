import { NextRequest } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

/**
 * Check if request has valid admin authentication
 * This checks both the admin cookie AND verifies the user has admin role in database
 */
export async function isAdminAuthenticated(req: NextRequest): Promise<boolean> {
  try {
    // First check for admin cookie as a quick validation
    const cookieAuth = req.cookies.get('admin-auth')?.value;
    const adminSecret = req.headers.get('x-admin-secret');

    // Allow header-based auth for API access (e.g., cron jobs)
    if (adminSecret && process.env.ADMIN_SECRET) {
      return adminSecret === process.env.ADMIN_SECRET;
    }

    // For UI access, require both cookie AND database role
    if (!cookieAuth || cookieAuth !== process.env.ADMIN_SECRET) {
      return false;
    }

    // Now verify the user actually has admin role in database
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    // Check if user has admin role in profiles table
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error || !profile || profile.role !== 'admin') {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking admin authentication:', error);
    return false;
  }
}

/**
 * Standard unauthorized response
 */
export function unauthorizedResponse() {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Unauthorized',
      message: 'Admin authentication required'
    }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}