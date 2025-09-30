import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * Nuclear option: Delete ALL agencies and users except admin@syncedupsolutions.com
 * This is used for testing/cleanup only
 */
export async function POST(req: NextRequest) {
  try {
    const { confirm_email } = await req.json();

    // Safety check: must provide admin email to confirm
    if (confirm_email !== 'admin@syncedupsolutions.com') {
      return NextResponse.json(
        { error: 'Must provide confirm_email: "admin@syncedupsolutions.com" to proceed' },
        { status: 400 }
      );
    }

    console.log('[Reset] Starting comprehensive cleanup...');

    // Step 1: Get admin user ID
    const { data: adminUser, error: adminError } = await sbAdmin.auth.admin.listUsers();

    if (adminError) {
      throw new Error(`Failed to fetch admin user: ${adminError.message}`);
    }

    const admin = adminUser.users.find(u => u.email === 'admin@syncedupsolutions.com');

    if (!admin) {
      throw new Error('Admin user not found!');
    }

    console.log('[Reset] Found admin user:', admin.id);

    // Step 2: Get admin's agency ID
    const { data: adminAgency } = await sbAdmin
      .from('agencies')
      .select('id')
      .eq('owner_user_id', admin.id)
      .single();

    const adminAgencyId = adminAgency?.id;

    console.log('[Reset] Admin agency ID:', adminAgencyId);

    // Step 3: Delete discovery sessions (except admin's)
    if (adminAgencyId) {
      const { error: discoveryError } = await sbAdmin
        .from('discovery_sessions')
        .delete()
        .neq('agency_id', adminAgencyId);

      if (discoveryError) {
        console.error('[Reset] Discovery sessions error:', discoveryError);
      } else {
        console.log('[Reset] ✓ Deleted non-admin discovery sessions');
      }
    }

    // Step 4: Delete webhook tokens (except admin's)
    if (adminAgencyId) {
      const { error: webhookError } = await sbAdmin
        .from('webhook_tokens')
        .delete()
        .neq('agency_id', adminAgencyId);

      if (webhookError) {
        console.error('[Reset] Webhook tokens error:', webhookError);
      } else {
        console.log('[Reset] ✓ Deleted non-admin webhook tokens');
      }
    }

    // Step 5: Delete user_agencies (except admin's)
    if (adminAgencyId) {
      const { error: membershipError } = await sbAdmin
        .from('user_agencies')
        .delete()
        .neq('agency_id', adminAgencyId);

      if (membershipError) {
        console.error('[Reset] User agencies error:', membershipError);
      } else {
        console.log('[Reset] ✓ Deleted non-admin agency memberships');
      }
    }

    // Step 6: Delete agencies (except admin's)
    const { error: agenciesError } = await sbAdmin
      .from('agencies')
      .delete()
      .neq('owner_user_id', admin.id);

    if (agenciesError) {
      console.error('[Reset] Agencies error:', agenciesError);
    } else {
      console.log('[Reset] ✓ Deleted non-admin agencies');
    }

    // Step 7: Delete profiles (except admin's)
    const { error: profilesError } = await sbAdmin
      .from('profiles')
      .delete()
      .neq('email', 'admin@syncedupsolutions.com');

    if (profilesError) {
      console.error('[Reset] Profiles error:', profilesError);
    } else {
      console.log('[Reset] ✓ Deleted non-admin profiles');
    }

    // Step 8: Delete auth users (except admin)
    const usersToDelete = adminUser.users.filter(u => u.email !== 'admin@syncedupsolutions.com');
    let deletedCount = 0;

    for (const user of usersToDelete) {
      try {
        await sbAdmin.auth.admin.deleteUser(user.id);
        deletedCount++;
        console.log(`[Reset] ✓ Deleted user: ${user.email}`);
      } catch (error: any) {
        console.error(`[Reset] Failed to delete user ${user.email}:`, error.message);
      }
    }

    console.log('[Reset] ✓ Cleanup complete!');

    return NextResponse.json({
      success: true,
      message: 'Cleanup complete',
      stats: {
        users_deleted: deletedCount,
        admin_preserved: admin.email,
        admin_agency_preserved: adminAgencyId
      }
    });

  } catch (error: any) {
    console.error('[Reset] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET: Preview what will be deleted
 */
export async function GET(req: NextRequest) {
  try {
    // Get all users
    const { data: allUsers, error: usersError } = await sbAdmin.auth.admin.listUsers();

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    const admin = allUsers.users.find(u => u.email === 'admin@syncedupsolutions.com');
    const usersToDelete = allUsers.users.filter(u => u.email !== 'admin@syncedupsolutions.com');

    // Get admin's agency
    const { data: adminAgency } = admin ? await sbAdmin
      .from('agencies')
      .select('*')
      .eq('owner_user_id', admin.id)
      .single() : { data: null };

    // Get all agencies
    const { data: allAgencies } = await sbAdmin
      .from('agencies')
      .select('id, name, slug, owner_user_id');

    const agenciesToDelete = allAgencies?.filter(a => a.owner_user_id !== admin?.id) || [];

    // Get all profiles
    const { data: allProfiles } = await sbAdmin
      .from('profiles')
      .select('id, email, full_name');

    const profilesToDelete = allProfiles?.filter(p => p.email !== 'admin@syncedupsolutions.com') || [];

    return NextResponse.json({
      preview: true,
      admin: {
        user: admin ? { id: admin.id, email: admin.email } : null,
        agency: adminAgency
      },
      to_delete: {
        users_count: usersToDelete.length,
        users: usersToDelete.map(u => ({ id: u.id, email: u.email })),
        agencies_count: agenciesToDelete.length,
        agencies: agenciesToDelete,
        profiles_count: profilesToDelete.length,
        profiles: profilesToDelete
      }
    });

  } catch (error: any) {
    console.error('[Reset] Preview error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}