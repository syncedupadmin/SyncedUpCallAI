import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') || '/dashboard';

  if (!code) {
    console.error('Auth callback: No code provided');
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth callback: Code exchange failed:', error);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin)
      );
    }

    console.log('Auth callback: Code exchange successful, type:', type);

    // If this is a password recovery, always redirect to reset-password
    if (type === 'recovery') {
      return NextResponse.redirect(new URL('/reset-password', url.origin));
    }

    // Otherwise use the next parameter or default to dashboard
    return NextResponse.redirect(new URL(next, url.origin));
  } catch (err: any) {
    console.error('Auth callback: Unexpected error:', err);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(err?.message || 'Authentication failed')}`, url.origin)
    );
  }
}