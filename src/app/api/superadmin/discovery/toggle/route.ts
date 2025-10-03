import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Super Admin Discovery Toggle API
 * Toggles discovery_status for an agency between pending/skipped/completed
 */
export async function POST(req: NextRequest) {
  try {
    // Verify super admin access
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('[Super Admin] Auth error:', authError);
      return NextResponse.json(
        { error: 'Authentication failed', details: authError.message },
        { status: 401 }
      );
    }

    if (!user) {
      console.error('[Super Admin] No user found');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user is super admin using the database function
    const { data: isSuperAdmin, error: adminCheckError } = await supabase.rpc('is_super_admin');

    if (adminCheckError || !isSuperAdmin) {
      console.error('[Super Admin] Unauthorized:', { userEmail: user.email, isSuperAdmin });
      return NextResponse.json({ error: 'Unauthorized - not super admin' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { agency_id, discovery_status } = body;

    if (!agency_id) {
      return NextResponse.json(
        { error: 'agency_id is required' },
        { status: 400 }
      );
    }

    // Validate discovery_status
    const validStatuses = ['pending', 'skipped', 'completed', null];
    if (discovery_status !== undefined && !validStatuses.includes(discovery_status)) {
      return NextResponse.json(
        { error: 'Invalid discovery_status. Must be: pending, skipped, completed, or null' },
        { status: 400 }
      );
    }

    console.log(`[Super Admin] Updating discovery status for agency ${agency_id} to ${discovery_status}`);

    // Update discovery status
    const updateData: any = {
      discovery_status,
      updated_at: new Date().toISOString()
    };

    // If skipping, add a skip reason
    if (discovery_status === 'skipped') {
      updateData.discovery_skip_reason = 'super_admin_override';
      updateData.discovery_session_id = null;
    }
    // If resetting to pending, clear session
    else if (discovery_status === 'pending' || discovery_status === null) {
      updateData.discovery_session_id = null;
      updateData.discovery_skip_reason = null;
    }

    const { error: updateError } = await sbAdmin
      .from('agencies')
      .update(updateData)
      .eq('id', agency_id);

    if (updateError) {
      console.error('[Super Admin] Error updating discovery status:', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update discovery status' },
        { status: 500 }
      );
    }

    console.log(`[Super Admin] Successfully updated discovery status for agency ${agency_id} to ${discovery_status}`);

    return NextResponse.json({
      success: true,
      message: `Discovery status updated to ${discovery_status || 'null'}`,
      discovery_status
    });

  } catch (error: any) {
    console.error('[Super Admin] Discovery toggle error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to toggle discovery status' },
      { status: 500 }
    );
  }
}