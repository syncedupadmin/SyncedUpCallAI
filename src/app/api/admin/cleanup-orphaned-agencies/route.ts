import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * Cleanup orphaned agencies where the owner user no longer exists
 * GET: List orphaned agencies
 * DELETE: Remove orphaned agencies
 */
export async function GET(req: NextRequest) {
  try {
    // Find agencies where owner_user_id doesn't exist in auth.users
    const { data: agencies, error } = await sbAdmin
      .from('agencies')
      .select('id, name, slug, owner_user_id, created_at, discovery_status');

    if (error) {
      console.error('Error fetching agencies:', error);
      return NextResponse.json({ error: 'Failed to fetch agencies' }, { status: 500 });
    }

    // Check which ones are orphaned (owner doesn't exist)
    const orphanedAgencies = [];

    for (const agency of agencies || []) {
      const { data: user, error: userError } = await sbAdmin.auth.admin.getUserById(agency.owner_user_id);

      if (userError || !user.user) {
        orphanedAgencies.push(agency);
      }
    }

    return NextResponse.json({
      success: true,
      orphaned_count: orphanedAgencies.length,
      orphaned_agencies: orphanedAgencies
    });

  } catch (error: any) {
    console.error('[Cleanup] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { slug } = await req.json();

    if (!slug) {
      return NextResponse.json(
        { error: 'Slug is required' },
        { status: 400 }
      );
    }

    // Delete the agency by slug
    const { error: deleteError } = await sbAdmin
      .from('agencies')
      .delete()
      .eq('slug', slug);

    if (deleteError) {
      console.error('Error deleting agency:', deleteError);
      return NextResponse.json(
        { error: `Failed to delete agency: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Agency with slug '${slug}' has been deleted`
    });

  } catch (error: any) {
    console.error('[Cleanup] Delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}