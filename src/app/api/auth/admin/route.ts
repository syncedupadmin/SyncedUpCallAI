import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export const runtime = 'nodejs'; // not edge, we need proper cookies

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookies) => {
            cookies.forEach((cookie) => {
              cookieStore.set(cookie);
            });
          },
        },
      }
    );

    // Attempt to sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 401 }
      );
    }

    if (!data?.user) {
      return Response.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check if user is super admin using the database function
    const { data: isSuper, error: adminCheckError } = await supabase.rpc('is_super_admin');

    if (adminCheckError) {
      return Response.json(
        { error: adminCheckError.message },
        { status: 500 }
      );
    }

    if (!isSuper) {
      // Sign out the non-admin user
      await supabase.auth.signOut();
      return Response.json(
        { error: 'Access denied. Admin privileges required.' },
        { status: 403 }
      );
    }

    // Set admin cookie
    cookieStore.set({
      name: 'su_admin',
      value: 'true',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 6, // 6 hours
    });

    return Response.json(
      { ok: true, user: data.user },
      { status: 200 }
    );
  } catch (error) {
    console.error('Admin auth error:', error);
    return Response.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookies) => {
            cookies.forEach((cookie) => {
              cookieStore.set(cookie);
            });
          },
        },
      }
    );

    await supabase.auth.signOut();

    // Clear admin auth cookie
    cookieStore.delete('su_admin');

    return Response.json(
      { ok: true },
      { status: 200 }
    );
  } catch (error) {
    console.error('Logout error:', error);
    return Response.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookies) => {
          cookies.forEach((cookie) => {
            cookieStore.set(cookie);
          });
        },
      },
    }
  );

  const { data: userRes, error: uerr } = await supabase.auth.getUser();
  if (uerr || !userRes?.user) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { data: isSuper, error } = await supabase.rpc('is_super_admin');
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!isSuper) {
    return Response.json({ error: 'Access denied. Admin privileges required.' }, { status: 403 });
  }

  // set short-lived admin cookie
  cookieStore.set({
    name: 'su_admin',
    value: 'true',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 6,
  });

  return Response.json({ ok: true, user: userRes.user }, { status: 200 });
}