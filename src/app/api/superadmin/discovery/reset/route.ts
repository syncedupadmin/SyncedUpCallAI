import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Super Admin Discovery Reset API
 * Resets discovery_status for an agency to allow re-running discovery
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

    const adminEmail = process.env.ADMIN_EMAIL;
    if (user.email !== adminEmail) {
      console.error('[Super Admin] Unauthorized:', { userEmail: user.email, adminEmail });
      return NextResponse.json({ error: 'Unauthorized - not super admin' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { agency_id } = body;

    if (!agency_id) {
      return NextResponse.json(
        { error: 'agency_id is required' },
        { status: 400 }
      );
    }

    console.log(`[Super Admin] Resetting discovery status for agency ${agency_id}`);

    // Reset discovery status to allow re-running discovery
    const { error: updateError } = await sbAdmin
      .from('agencies')
      .update({
        discovery_status: null,
        discovery_session_id: null
      })
      .eq('id', agency_id);

    if (updateError) {
      console.error('[Super Admin] Error resetting discovery:', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to reset discovery status' },
        { status: 500 }
      );
    }

    console.log(`[Super Admin] Successfully reset discovery status for agency ${agency_id}`);

    return NextResponse.json({
      success: true,
      message: 'Discovery status reset successfully - agency can now run discovery again'
    });

  } catch (error: any) {
    console.error('[Super Admin] Discovery reset error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reset discovery status' },
      { status: 500 }
    );
  }
}
