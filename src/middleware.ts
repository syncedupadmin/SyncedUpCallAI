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

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Get user's access level
    const { data: userLevel, error: levelError } = await supabase.rpc('get_user_level');

    // Log for debugging
    console.log('Admin check in middleware:', {
      path: request.nextUrl.pathname,
      user: user?.email,
      userLevel,
      levelError,
      hasAdminCookie: !!request.cookies.get('admin-auth')?.value
    });

    // Check access based on path
    if (request.nextUrl.pathname.startsWith('/admin/super')) {
      // Super admin pages require super_admin level
      if (userLevel !== 'super_admin') {
        console.log('User is not super admin, checking if regular admin');
        if (userLevel === 'admin') {
          // Regular admin trying to access super admin page
          console.log('Regular admin redirecting to operator console');
          return NextResponse.redirect(new URL('/admin', request.url));
        } else {
          // Regular user trying to access super admin page
          console.log('Regular user redirecting to dashboard');
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
      }
    } else {
      // Regular admin pages require at least admin level
      if (userLevel !== 'admin' && userLevel !== 'super_admin') {
        console.log('User is not admin, redirecting to dashboard');
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }

    // User has appropriate access level
    console.log(`User has ${userLevel} access, allowing access to ${request.nextUrl.pathname}`);

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

  // Redirect logged-in users from public pages to their appropriate portal
  if ((request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup') && user) {
    // Get user's level to redirect to appropriate portal
    const { data: userLevel } = await supabase.rpc('get_user_level');

    switch(userLevel) {
      case 'super_admin':
        return NextResponse.redirect(new URL('/admin/super', request.url));
      case 'admin':
        return NextResponse.redirect(new URL('/admin', request.url));
      default:
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }
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