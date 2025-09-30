import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * List all auth users in the system
 */
export async function GET(req: NextRequest) {
  try {
    const { data, error } = await sbAdmin.auth.admin.listUsers();

    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    const users = data.users.map(u => ({
      id: u.id,
      email: u.email,
      email_confirmed_at: u.email_confirmed_at,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at
    }));

    return NextResponse.json({
      success: true,
      count: users.length,
      users
    });

  } catch (error: any) {
    console.error('[List Users] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Delete a specific user by email
 */
export async function DELETE(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Don't allow deleting admin
    if (email === 'admin@syncedupsolutions.com') {
      return NextResponse.json(
        { error: 'Cannot delete admin user' },
        { status: 400 }
      );
    }

    // Find user by email
    const { data: allUsers } = await sbAdmin.auth.admin.listUsers();
    const user = allUsers.users.find(u => u.email === email);

    if (!user) {
      return NextResponse.json(
        { error: `User with email ${email} not found` },
        { status: 404 }
      );
    }

    // Delete the user
    const { error: deleteError } = await sbAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      throw new Error(`Failed to delete user: ${deleteError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `User ${email} deleted successfully`
    });

  } catch (error: any) {
    console.error('[Delete User] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}