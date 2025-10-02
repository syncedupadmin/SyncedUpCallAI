/**
 * CRITICAL SECURITY MODULE - MULTI-TENANT ISOLATION
 * This module enforces strict agency isolation for all data access
 * RULE: Agency A must NEVER see Agency B's data
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export interface AgencyContext {
  userId: string;
  agencyId: string;
  agencyIds: string[];
  role: 'owner' | 'admin' | 'agent';
  isSuperAdmin: boolean;
}

/**
 * Critical: Get authenticated user's agency context
 * Throws error if no valid agency access
 */
export async function getAgencyContext(): Promise<AgencyContext> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    console.error('[SECURITY] Authentication failed:', authError);
    throw new Error('UNAUTHORIZED: Authentication required');
  }

  // Check if superadmin first
  const { data: superAdminCheck } = await supabase.rpc('is_super_admin');
  const isSuperAdmin = superAdminCheck === true;

  const { data: agencies, error: agencyError } = await supabase
    .from('user_agencies')
    .select('agency_id, role')
    .eq('user_id', user.id);

  // Superadmins can proceed even without agency membership
  if ((!agencies?.length || agencyError) && !isSuperAdmin) {
    console.error('[SECURITY] No agency access for user:', user.id);
    throw new Error('FORBIDDEN: No agency access');
  }

  // For superadmins without agencies, use placeholder values
  if (isSuperAdmin && !agencies?.length) {
    console.log('[SECURITY] Superadmin access granted without agency:', user.id);
    return {
      userId: user.id,
      agencyId: 'superadmin', // Placeholder for queries that need filtering
      agencyIds: [],
      role: 'admin' as const,
      isSuperAdmin: true
    };
  }

  return {
    userId: user.id,
    agencyId: agencies![0].agency_id,
    agencyIds: agencies!.map(a => a.agency_id),
    role: agencies![0].role,
    isSuperAdmin
  };
}

/**
 * Security wrapper for ALL API routes
 * Enforces authentication and agency context
 */
export function withStrictAgencyIsolation<T extends any[] = any[]>(
  handler: (req: NextRequest, context: AgencyContext, ...args: T) => Promise<NextResponse>
) {
  return async (req: NextRequest, ...args: T): Promise<NextResponse> => {
    try {
      console.log(`[SECURITY AUDIT] ${req.method} ${req.url} at ${new Date().toISOString()}`);

      const context = await getAgencyContext();

      console.log(`[SECURITY] Authorized access for user ${context.userId} in agency ${context.agencyId}`);

      return await handler(req, context, ...args);
    } catch (error: any) {
      console.error(`[SECURITY VIOLATION] ${req.method} ${req.url}:`, error.message);

      if (error.message.includes('UNAUTHORIZED')) {
        return NextResponse.json(
          { error: 'Authentication required', code: 'AUTH_REQUIRED' },
          { status: 401 }
        );
      }

      if (error.message.includes('FORBIDDEN')) {
        return NextResponse.json(
          { error: 'Access denied', code: 'ACCESS_DENIED' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Request failed', code: 'INTERNAL_ERROR' },
        { status: 500 }
      );
    }
  };
}

/**
 * Create Supabase client with RLS enforcement
 * NEVER use raw database connections
 */
export function createSecureClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

/**
 * Validate that a resource belongs to user's agency
 * Use for single resource access
 */
export async function validateResourceAccess(
  resourceId: string,
  tableName: string,
  context: AgencyContext
): Promise<boolean> {
  const supabase = createSecureClient();

  const { data, error } = await supabase
    .from(tableName)
    .select('agency_id')
    .eq('id', resourceId)
    .in('agency_id', context.agencyIds)
    .single();

  return !error && data !== null;
}