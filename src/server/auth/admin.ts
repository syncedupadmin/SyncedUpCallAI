import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface AdminContext {
  userId: string;
  isSuperAdmin: boolean;
  agencyIds: string[];
  email?: string;
}

/**
 * Get admin context with user info and agency access
 * Returns null if not authenticated as admin
 */
export async function getAdminContext(req: NextRequest): Promise<AdminContext | null> {
  try {
    // Allow header-based auth for API access (e.g., cron jobs)
    const adminSecret = req.headers.get('x-admin-secret');
    if (adminSecret && process.env.ADMIN_SECRET && adminSecret === process.env.ADMIN_SECRET) {
      // Service account - has access to all agencies
      return {
        userId: 'system',
        isSuperAdmin: true,
        agencyIds: [],
        email: 'system@service'
      };
    }

    // Check if user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    // Check if user is a super admin
    const { data: isSuperAdmin, error: superAdminError } = await supabase
      .rpc('is_super_admin');

    if (superAdminError) {
      console.error('Error calling is_super_admin:', superAdminError);
      return null;
    }

    // Get user's agencies
    const { data: userAgencies, error: agenciesError } = await supabase
      .from('user_agencies')
      .select('agency_id, role')
      .eq('user_id', user.id);

    if (agenciesError) {
      console.error('Error fetching user agencies:', agenciesError);
    }

    const agencyIds = userAgencies?.map(ua => ua.agency_id) || [];
    const hasAdminRole = userAgencies?.some(ua => ['owner', 'admin'].includes(ua.role));

    // Must be either super admin OR have admin/owner role in at least one agency
    if (!isSuperAdmin && !hasAdminRole) {
      return null;
    }

    return {
      userId: user.id,
      isSuperAdmin: isSuperAdmin === true,
      agencyIds,
      email: user.email
    };
  } catch (error) {
    console.error('Error getting admin context:', error);
    return null;
  }
}

/**
 * Check if request has valid admin authentication
 * This checks both the admin cookie AND verifies the user has admin role in database
 */
export async function isAdminAuthenticated(req: NextRequest): Promise<boolean> {
  const context = await getAdminContext(req);
  return context !== null;
}

/**
 * Check if request is from a super admin
 */
export async function isSuperAdminAuthenticated(req: NextRequest): Promise<boolean> {
  const context = await getAdminContext(req);
  return context?.isSuperAdmin === true;
}

/**
 * Standard unauthorized response
 */
export function unauthorizedResponse() {
  return NextResponse.json({
    ok: false,
    error: 'Unauthorized',
    message: 'Admin authentication required'
  }, { status: 401 });
}

/**
 * Forbidden response for super admin only routes
 */
export function forbiddenResponse() {
  return NextResponse.json({
    ok: false,
    error: 'Forbidden',
    message: 'Super admin access required'
  }, { status: 403 });
}