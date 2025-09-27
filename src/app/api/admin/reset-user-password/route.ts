import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json(
        { ok: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Create admin client with service_role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get user by email
    const { data: users, error: getUserError } = await supabaseAdmin.auth.admin.listUsers();

    if (getUserError) {
      console.error('Error listing users:', getUserError);
      return NextResponse.json(
        { ok: false, error: 'Failed to find user' },
        { status: 500 }
      );
    }

    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Update user password using Admin API
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password }
    );

    if (error) {
      console.error('Error updating password:', error);
      return NextResponse.json(
        { ok: false, error: error.message || 'Failed to update password' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Password updated successfully',
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });
  } catch (error: any) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}