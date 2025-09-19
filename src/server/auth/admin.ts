import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Check if request has valid admin authentication
 * This checks both the admin cookie AND verifies the user has admin role in database
 */
export async function isAdminAuthenticated(req: NextRequest): Promise<boolean> {
  try {
    // Allow header-based auth for API access (e.g., cron jobs)
    const adminSecret = req.headers.get('x-admin-secret');
    if (adminSecret && process.env.ADMIN_SECRET) {
      return adminSecret === process.env.ADMIN_SECRET;
    }

    // Check if user is authenticated and has admin role
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    // Check if user is a super admin using the is_super_admin() function
    const { data: isSuperAdmin, error } = await supabase
      .rpc('is_super_admin');

    if (error) {
      console.error('Error calling is_super_admin:', error);
      return false;
    }

    return isSuperAdmin === true;
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