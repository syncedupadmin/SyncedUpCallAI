import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Validate admin email
    if (email !== 'admin@syncedupsolutions.com') {
      return NextResponse.json(
        { error: 'Unauthorized access' },
        { status: 403 }
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

    if (data?.user && data.user.email === 'admin@syncedupsolutions.com') {
      // Create response with admin cookie
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
    }

    return NextResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    );
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