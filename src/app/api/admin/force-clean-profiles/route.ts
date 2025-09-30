import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * NUCLEAR OPTION: Delete ALL profiles except admin
 */
export async function POST(req: NextRequest) {
  try {
    const { confirm } = await req.json();

    if (confirm !== 'DELETE_ALL_EXCEPT_ADMIN') {
      return NextResponse.json(
        { error: 'Must provide confirm: "DELETE_ALL_EXCEPT_ADMIN"' },
        { status: 400 }
      );
    }

    // Get admin user ID
    const { data: adminUser } = await sbAdmin.auth.admin.listUsers();
    const admin = adminUser.users.find(u => u.email === 'admin@syncedupsolutions.com');

    if (!admin) {
      throw new Error('Admin user not found!');
    }

    // Delete ALL profiles except admin's
    const { error: deleteError } = await sbAdmin
      .from('profiles')
      .delete()
      .neq('id', admin.id);

    if (deleteError) {
      throw new Error(`Failed to delete profiles: ${deleteError.message}`);
    }

    // List remaining profiles
    const { data: remaining } = await sbAdmin
      .from('profiles')
      .select('*');

    return NextResponse.json({
      success: true,
      message: 'Deleted all profiles except admin',
      admin_id: admin.id,
      remaining_profiles: remaining
    });

  } catch (error: any) {
    console.error('[Force Clean] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}