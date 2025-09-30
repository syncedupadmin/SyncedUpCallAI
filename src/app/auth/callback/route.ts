import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const next = searchParams.get('next') ?? '/dashboard';
  const type = searchParams.get('type');

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete(name);
        },
      },
    }
  );

  try {
    // Handle PKCE code flow (modern approach)
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Error exchanging code for session:', error);
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
      }

      // Check if this is a password recovery flow
      if (type === 'recovery') {
        const response = NextResponse.redirect(`${origin}/reset-password`);
        response.cookies.set('password_reset_session', JSON.stringify({
          createdAt: Date.now(),
          type: 'recovery'
        }), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 15, // 15 minutes
          path: '/'
        });
        return response;
      }

      // For new signups, redirect to discovery setup
      if (type === 'signup') {
        return NextResponse.redirect(`${origin}/dashboard/discovery`);
      }

      // For regular sign in, redirect to the specified next path or dashboard
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Handle token_hash flow (email confirmations using hash-based auth)
    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as any,
      });

      if (error) {
        console.error('Error verifying OTP:', error);
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
      }

      // Check if this is a password recovery flow
      if (type === 'recovery') {
        const response = NextResponse.redirect(`${origin}/reset-password`);
        response.cookies.set('password_reset_session', JSON.stringify({
          createdAt: Date.now(),
          type: 'recovery'
        }), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 15, // 15 minutes
          path: '/'
        });
        return response;
      }

      // For new signups, redirect to discovery setup
      if (type === 'signup' || type === 'invite') {
        return NextResponse.redirect(`${origin}/dashboard/discovery`);
      }

      // For email changes or other confirmations
      return NextResponse.redirect(`${origin}/dashboard`);
    }

    // No code or token_hash provided, redirect to login
    return NextResponse.redirect(`${origin}/login`);
  } catch (error) {
    console.error('Auth callback error:', error);
    return NextResponse.redirect(`${origin}/login?error=Authentication%20failed`);
  }
}