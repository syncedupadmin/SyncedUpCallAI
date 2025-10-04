import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ipAddress } from '@vercel/edge';

// Simple in-memory rate limiter for edge runtime
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Rate limit configurations
const rateLimitConfigs = {
  '/api/jobs/transcribe': { maxRequests: 10, windowMs: 60000 },
  '/api/jobs/analyze': { maxRequests: 20, windowMs: 60000 },
  '/api/webhooks': { maxRequests: 100, windowMs: 60000 },
  'default': { maxRequests: 30, windowMs: 60000 }
};

function getRateLimitConfig(pathname: string) {
  // Check for exact match first
  if (rateLimitConfigs[pathname as keyof typeof rateLimitConfigs]) {
    return rateLimitConfigs[pathname as keyof typeof rateLimitConfigs];
  }

  // Check for prefix match
  for (const [path, config] of Object.entries(rateLimitConfigs)) {
    if (pathname.startsWith(path)) {
      return config;
    }
  }

  return rateLimitConfigs.default;
}

async function handleRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;

  // Only apply rate limiting to API routes
  if (!pathname.startsWith('/api/')) {
    return null;
  }

  // Skip rate limiting for internal cron jobs
  if (pathname.startsWith('/api/cron/') && request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`) {
    return null;
  }

  // Get client IP
  const ip = ipAddress(request) || 'unknown';
  const config = getRateLimitConfig(pathname);
  const key = `${ip}:${pathname}`;

  const now = Date.now();
  const clientData = rateLimitMap.get(key);

  if (!clientData || clientData.resetTime < now) {
    rateLimitMap.set(key, { count: 1, resetTime: now + config.windowMs });
  } else {
    clientData.count++;

    if (clientData.count > config.maxRequests) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(clientData.resetTime).toISOString(),
            'Retry-After': String(Math.ceil((clientData.resetTime - now) / 1000))
          }
        }
      );
    }
  }

  return null;
}

export async function middleware(request: NextRequest) {
  // CRITICAL: Skip all API routes immediately
  // This prevents auth middleware from interfering with webhooks
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Apply rate limiting for API routes
    const rateLimitResponse = await handleRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }
    return NextResponse.next();
  }

  // Skip middleware for auth routes - they handle their own logic
  if (request.nextUrl.pathname.startsWith('/auth/')) {
    return NextResponse.next();
  }

  // Check for recovery session cookie
  const recoverySessionCookie = request.cookies.get('password_reset_session');

  // If recovery session exists, validate and restrict access
  if (recoverySessionCookie?.value) {
    try {
      const sessionData = JSON.parse(recoverySessionCookie.value);
      const elapsed = Date.now() - sessionData.createdAt;
      const isExpired = elapsed > (15 * 60 * 1000); // 15 minutes

      // Clear expired cookie
      if (isExpired) {
        const response = NextResponse.next();
        response.cookies.set({
          name: 'password_reset_session',
          value: '',
          maxAge: 0,
          path: '/'
        });
        return response;
      }

      // For active recovery sessions, only allow specific paths
      const allowedPaths = [
        '/reset-password',
        '/auth/callback',
        '/api/auth',
        '/api/recovery-session',
        '/_next', // Next.js internals
        '/favicon.ico'
      ];

      const isAllowed = allowedPaths.some(path =>
        request.nextUrl.pathname.startsWith(path) ||
        request.nextUrl.pathname === path
      );

      if (!isAllowed) {
        // Redirect to password reset page with reason
        return NextResponse.redirect(
          new URL('/reset-password?reason=recovery_lock', request.url)
        );
      }
    } catch (error) {
      console.error('Invalid recovery session cookie:', error);
      // Clear invalid cookie
      const response = NextResponse.next();
      response.cookies.set({
        name: 'password_reset_session',
        value: '',
        maxAge: 0,
        path: '/'
      });
      return response;
    }
  }

  // Handle admin authentication for all admin and superadmin pages
  if (request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/superadmin')) {
    // Create Supabase client first to check authentication
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Check if user is super admin using the database function
    const { data: isSuperAdmin, error: adminError } = await supabase.rpc('is_super_admin');

    // Log for debugging
    console.log('Admin check in middleware:', {
      path: request.nextUrl.pathname,
      user: user?.email,
      isSuperAdmin,
      adminError,
      hasAdminCookie: !!request.cookies.get('su_admin')?.value
    });

    // All admin pages require super admin access
    if (!isSuperAdmin) {
      console.log('User is not super admin, redirecting to dashboard');
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // User has super admin access
    console.log(`User has super admin access, allowing access to ${request.nextUrl.pathname}`);

    // If super admin is accessing /admin, redirect to /superadmin
    if (isSuperAdmin && request.nextUrl.pathname.startsWith('/admin')) {
      const newPath = request.nextUrl.pathname.replace('/admin', '/superadmin');
      return NextResponse.redirect(new URL(newPath, request.url));
    }

    // Admin auth is valid, continue
    return NextResponse.next();
  }

  // Handle Supabase authentication for regular routes
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Protected routes (excluding admin which has its own auth)
  const protectedPaths = ['/dashboard', '/calls', '/analytics', '/reports', '/compliance'];
  const isProtectedPath = protectedPaths.some(path => request.nextUrl.pathname.startsWith(path));

  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Check subscription status for authenticated users on protected paths
  if (isProtectedPath && user) {
    // Check if user is super admin first - they bypass subscription checks
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');

    if (isSuperAdmin) {
      console.log('[Middleware] Super admin detected, bypassing subscription checks');
      // Super admins can access everything, skip subscription checks
      return response;
    }

    // Routes that don't require active subscription or discovery check
    const subscriptionExemptPaths = [
      '/dashboard/billing',
      '/dashboard/settings',
      '/dashboard/support',
      '/dashboard/discovery', // Allow access to discovery pages
      '/compliance' // Compliance portal has its own product tier checks
    ];

    const isExemptPath = subscriptionExemptPaths.some(path =>
      request.nextUrl.pathname.startsWith(path)
    );

    // Skip subscription check for exempt paths
    if (!isExemptPath) {
      // Get user's agency, subscription status, and discovery status
      const { data: membership } = await supabase
        .from('user_agencies')
        .select(`
          agency_id,
          role,
          agencies!inner (
            id,
            name,
            discovery_status,
            agency_subscriptions (
              status,
              trial_end,
              current_period_end,
              cancel_at_period_end
            )
          )
        `)
        .eq('user_id', user.id)
        .single();

      if (!membership) {
        // User has no agency - this should not happen for new registrations
        // Check if they just signed up (coming from auth callback)
        const referer = request.headers.get('referer');
        if (referer?.includes('/auth/callback')) {
          // New user just confirmed email but agency not found - might be timing issue
          // Let them through, the dashboard will handle it
          console.warn('[Middleware] New user with no agency found, allowing through');
        } else {
          // Existing user with no agency - redirect to onboarding
          return NextResponse.redirect(new URL('/onboarding', request.url));
        }
      }

      const agency = (membership as any).agencies;

      // Handle discovery flow based on status
      const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard');
      const isDiscoveryRoute = request.nextUrl.pathname.startsWith('/dashboard/discovery');

      // If discovery is skipped, allow normal access
      if (agency?.discovery_status === 'skipped') {
        // Discovery was intentionally skipped - allow full dashboard access
        console.log(`[Middleware] Discovery skipped for agency ${agency.id}, allowing dashboard access`);
      }
      // If user hasn't completed discovery yet
      else if (agency?.discovery_status === 'pending' && isDashboardRoute) {
        // Allow discovery routes but redirect others to discovery setup
        if (!isDiscoveryRoute) {
          console.log(`[Middleware] Redirecting new user to discovery setup`);
          return NextResponse.redirect(new URL('/dashboard/discovery', request.url));
        }
      }

      // If discovery is running, keep them on the results page
      if (agency?.discovery_status === 'in_progress' && isDashboardRoute) {
        if (request.nextUrl.pathname !== '/dashboard/discovery/results') {
          console.log(`[Middleware] Discovery in progress, showing results`);
          return NextResponse.redirect(new URL('/dashboard/discovery/results', request.url));
        }
      }

      // If discovery failed, redirect back to setup with retry flag
      if (agency?.discovery_status === 'failed' && isDashboardRoute) {
        if (!isDiscoveryRoute) {
          console.log(`[Middleware] Discovery failed, redirecting to setup`);
          return NextResponse.redirect(new URL('/dashboard/discovery?retry=true', request.url));
        }
      }

      const subscription = (membership as any).agencies?.agency_subscriptions?.[0];

      // Debug logging for subscription issues
      if (isDiscoveryRoute) {
        console.log('[Middleware] Discovery route access:', {
          path: request.nextUrl.pathname,
          discovery_status: agency?.discovery_status,
          has_subscription: !!subscription,
          subscription_status: subscription?.status,
          subscription_array_length: (membership as any).agencies?.agency_subscriptions?.length
        });
      }

      // Exempt discovery flow for agencies still in onboarding
      const isInDiscoveryOnboarding = ['pending', 'in_progress', 'failed'].includes(agency?.discovery_status || '');
      const shouldExemptDiscoveryFlow = isDiscoveryRoute && isInDiscoveryOnboarding;

      // Skip subscription check if user is completing initial discovery onboarding
      if (!shouldExemptDiscoveryFlow) {
        // Check if subscription exists and is active
        const hasActiveSubscription = subscription &&
          (subscription.status === 'active' || subscription.status === 'trialing');

        // Check if trial has expired
        const trialExpired = subscription?.status === 'trialing' &&
          subscription.trial_end &&
          new Date(subscription.trial_end) < new Date();

        // Check if subscription is past due or canceled
        const subscriptionInactive = subscription &&
          ['past_due', 'canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status);

        // Redirect to billing if subscription is not active
        if (!hasActiveSubscription || trialExpired || subscriptionInactive) {
          // Add query params to show appropriate message
          const params = new URLSearchParams();
          if (trialExpired) {
            params.set('message', 'trial_expired');
          } else if (subscriptionInactive) {
            params.set('message', 'subscription_inactive');
          } else if (!subscription) {
            params.set('message', 'no_subscription');
          }

          return NextResponse.redirect(
            new URL(`/dashboard/billing?${params.toString()}`, request.url)
          );
        }
      }
    }
  }

  // Redirect logged-in users from public pages to their appropriate portal
  if ((request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup') && user) {
    // Check if user is super admin
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');

    if (isSuperAdmin) {
      return NextResponse.redirect(new URL('/superadmin', request.url));
    } else {
      // Check if user's agency is compliance-only
      const { data: userAgency } = await supabase
        .from('user_agencies')
        .select('agencies!inner(product_type)')
        .eq('user_id', user.id)
        .single();

      const isComplianceOnly = (userAgency as any)?.agencies?.product_type === 'compliance_only';

      if (isComplianceOnly) {
        return NextResponse.redirect(new URL('/compliance', request.url));
      } else {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
  }

  // Add rate limit headers to successful responses for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const pathname = request.nextUrl.pathname;
    const ip = ipAddress(request) || 'unknown';
    const config = getRateLimitConfig(pathname);
    const key = `${ip}:${pathname}`;
    const data = rateLimitMap.get(key);

    if (data) {
      response.headers.set('X-RateLimit-Limit', String(config.maxRequests));
      response.headers.set('X-RateLimit-Remaining', String(Math.max(0, config.maxRequests - data.count)));
      response.headers.set('X-RateLimit-Reset', new Date(data.resetTime).toISOString());
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};