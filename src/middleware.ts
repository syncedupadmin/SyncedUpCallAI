import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Handle admin authentication for all admin pages
  if (request.nextUrl.pathname.startsWith('/admin')) {
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

    // Check if user is authenticated and has admin role
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Check if user is admin using the database function
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');

    // Log for debugging
    console.log('Admin check in middleware:', {
      path: request.nextUrl.pathname,
      user: user?.email,
      isAdmin,
      adminError,
      hasAdminCookie: !!request.cookies.get('admin-auth')?.value
    });

    if (!isAdmin) {
      // User is not an admin, redirect to regular dashboard
      console.log('User is not admin, redirecting to dashboard');
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // If user is admin, allow access regardless of cookie
    // The cookie is just an additional security layer
    console.log('User is admin, allowing access');

    // Optionally check for admin-auth cookie for extra security
    // But don't block if it's missing - it will be set on next login
    const adminAuth = request.cookies.get('admin-auth')?.value;
    if (!adminAuth) {
      console.log('Admin cookie missing, but user is verified admin - allowing access');
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

  // Admin user redirect logic - check if user has admin role
  // This would need to be checked from the database profile
  // For now, we'll rely on the admin-auth cookie for admin access

  // Redirect to dashboard if logged in and trying to access home or login/signup
  if ((request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup') && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (API routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
};