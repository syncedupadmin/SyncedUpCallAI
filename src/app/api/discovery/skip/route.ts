import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sbAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * Allow agency to skip discovery and proceed to dashboard
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's agency
    const { data: membership, error: membershipError } = await supabase
      .from('user_agencies')
      .select('agency_id')
      .eq('user_id', user.id)
      .single();

    if (membershipError || !membership || !membership.agency_id) {
      return NextResponse.json({ error: 'No agency found' }, { status: 404 });
    }

    const agencyId = membership.agency_id;

    // Update agency to mark discovery as skipped
    await sbAdmin.from('agencies').update({
      discovery_status: 'skipped',
      discovery_skip_reason: 'user_skipped'
    }).eq('id', agencyId);

    console.log(`[Discovery] Agency ${agencyId} skipped discovery`);

    return NextResponse.json({
      success: true,
      message: 'Discovery skipped'
    });

  } catch (error: any) {
    console.error('[Discovery Skip] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to skip discovery' },
      { status: 500 }
    );
  }
}