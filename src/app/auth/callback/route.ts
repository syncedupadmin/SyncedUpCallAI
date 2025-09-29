import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const type = searchParams.get('type');

  if (code) {
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
      // Exchange the code for a session
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Error exchanging code for session:', error);
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
      }

      // Check if this is a password recovery flow
      if (type === 'recovery') {
        // Set a recovery session cookie (optional, for tracking)
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

      // For regular sign in, redirect to the specified next path or dashboard
      return NextResponse.redirect(`${origin}${next}`);
    } catch (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(`${origin}/login?error=Authentication%20failed`);
    }
  }

  // No code provided, redirect to login
  return NextResponse.redirect(`${origin}/login`);
}