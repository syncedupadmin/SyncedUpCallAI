import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Attempt to sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    if (!data?.user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check if user is admin using the database function
    const { data: isAdmin, error: adminCheckError } = await supabase.rpc('is_admin');

    if (adminCheckError || !isAdmin) {
      // Sign out the non-admin user
      await supabase.auth.signOut();

      return NextResponse.json(
        { error: 'Access denied. Admin privileges required.' },
        { status: 403 }
      );
    }

    // User is an admin, create response with admin cookie
    const response = NextResponse.json(
      {
        ok: true,
        user: {
          email: data.user.email,
          id: data.user.id,
          role: 'admin'
        }
      },
      { status: 200 }
    );

    // Set admin auth cookie
    response.cookies.set('admin-auth', process.env.ADMIN_SECRET || 'admin-secret-key', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    });

    return response;
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();

    const response = NextResponse.json(
      { ok: true },
      { status: 200 }
    );

    // Clear admin auth cookie
    response.cookies.delete('admin-auth');

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    // Check if user is admin using the database function
    const { data: isAdmin } = await supabase.rpc('is_admin');

    return NextResponse.json({
      authenticated: true,
      isAdmin: isAdmin || false,
      user: {
        email: user.email,
        id: user.id,
        role: isAdmin ? 'admin' : 'user'
      }
    });
  } catch (error) {
    console.error('Admin check error:', error);
    return NextResponse.json(
      { authenticated: false },
      { status: 500 }
    );
  }
}