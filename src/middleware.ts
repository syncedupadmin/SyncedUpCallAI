import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Skip middleware for auth routes - they handle their own logic
  if (request.nextUrl.pathname.startsWith('/auth/')) {
    return NextResponse.next();
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