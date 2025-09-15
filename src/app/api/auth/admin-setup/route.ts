import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

// This endpoint helps set up admin access directly
export async function POST(request: NextRequest) {
  try {
    const { email, secret } = await request.json();

    // Verify the setup secret
    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json(
        { error: 'Invalid setup secret' },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated. Please log in first.' },
        { status: 401 }
      );
    }

    // Add or update the admin user
    const { data, error } = await supabase
      .from('admin_users')
      .upsert({
        user_id: user.id,
        email: email || user.email,
        created_at: new Date().toISOString(),
        created_by: user.id
      }, {
        onConflict: 'email'
      })
      .select()
      .single();

    if (error) {
      console.error('Admin setup error:', error);
      return NextResponse.json(
        { error: 'Failed to set up admin user', details: error.message },
        { status: 500 }
      );
    }

    // Test if is_admin() works now
    const { data: isAdmin } = await supabase.rpc('is_admin');

    // Create response with admin cookie
    const response = NextResponse.json(
      {
        ok: true,
        message: 'Admin user configured successfully',
        user: {
          id: user.id,
          email: user.email,
          admin_email: data.email
        },
        isAdmin
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
    console.error('Admin setup error:', error);
    return NextResponse.json(
      { error: 'Setup failed', details: error },
      { status: 500 }
    );
  }
}

// GET endpoint to check current admin status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          authenticated: false,
          message: 'Not logged in'
        },
        { status: 401 }
      );
    }

    // Check admin status
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');

    // Get admin user info
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('*')
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .single();

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email
      },
      isAdmin: isAdmin || false,
      adminError: adminError?.message,
      adminUser,
      hasAdminCookie: request.cookies.has('admin-auth')
    });
  } catch (error) {
    console.error('Admin status check error:', error);
    return NextResponse.json(
      { error: 'Status check failed', details: error },
      { status: 500 }
    );
  }
}