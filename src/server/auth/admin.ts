import { NextRequest } from 'next/server';

/**
 * Check if request has valid admin authentication
 */
export function isAdminAuthenticated(req: NextRequest): boolean {
  const adminSecret = req.headers.get('x-admin-secret');
  const cookieAuth = req.cookies.get('admin-auth')?.value;

  // Check header authentication
  if (adminSecret && process.env.ADMIN_SECRET) {
    return adminSecret === process.env.ADMIN_SECRET;
  }

  // Check cookie authentication (for UI)
  if (cookieAuth && process.env.ADMIN_SECRET) {
    // Simple check - in production you'd want to use JWT or similar
    return cookieAuth === process.env.ADMIN_SECRET;
  }

  return false;
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