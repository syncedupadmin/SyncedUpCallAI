import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check if this is an admin page request
  if (request.nextUrl.pathname.startsWith('/admin/super')) {
    const adminAuth = request.cookies.get('admin-auth')?.value;

    // If no auth cookie or invalid, redirect to login
    if (!adminAuth || adminAuth !== process.env.ADMIN_SECRET) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/admin/super/:path*'
};