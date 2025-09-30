import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * List all profiles in the database
 */
export async function GET(req: NextRequest) {
  try {
    const { data: profiles, error } = await sbAdmin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list profiles: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      count: profiles?.length || 0,
      profiles
    });

  } catch (error: any) {
    console.error('[List Profiles] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Delete orphaned profiles (where user doesn't exist in auth.users)
 */
export async function DELETE(req: NextRequest) {
  try {
    // Get all profiles
    const { data: profiles, error: profilesError } = await sbAdmin
      .from('profiles')
      .select('id, email');

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    // Get all auth users
    const { data: authData } = await sbAdmin.auth.admin.listUsers();
    const authEmails = new Set(authData.users.map(u => u.email));

    // Find orphaned profiles
    const orphanedProfiles = profiles?.filter(p => !authEmails.has(p.email || '')) || [];

    if (orphanedProfiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orphaned profiles found'
      });
    }

    // Delete orphaned profiles
    const { error: deleteError } = await sbAdmin
      .from('profiles')
      .delete()
      .in('id', orphanedProfiles.map(p => p.id));

    if (deleteError) {
      throw new Error(`Failed to delete orphaned profiles: ${deleteError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${orphanedProfiles.length} orphaned profiles`,
      deleted: orphanedProfiles
    });

  } catch (error: any) {
    console.error('[Delete Orphaned Profiles] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}