import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
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
  const protectedPaths = ['/dashboard', '/calls', '/analytics', '/reports'];
  const isProtectedPath = protectedPaths.some(path => request.nextUrl.pathname.startsWith(path));

  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect logged-in users from public pages to their appropriate portal
  if ((request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup') && user) {
    // Check if user is super admin
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');

    if (isSuperAdmin) {
      return NextResponse.redirect(new URL('/superadmin', request.url));
    } else {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};