import { NextRequest, NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    // Security check - require secret
    const authHeader = req.headers.get('authorization');
    const secret = process.env.CRON_SECRET || process.env.JOBS_SECRET;

    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Backfill] Starting trial subscription backfill...');

    // Get all agencies without subscriptions
    const { data: agencies, error: agenciesError } = await sbAdmin
      .from('agencies')
      .select(`
        id,
        name,
        created_at,
        agency_subscriptions!left (id)
      `)
      .is('agency_subscriptions.id', null)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

    if (agenciesError) {
      console.error('[Backfill] Error fetching agencies:', agenciesError);
      return NextResponse.json({ error: agenciesError.message }, { status: 500 });
    }

    if (!agencies || agencies.length === 0) {
      console.log('[Backfill] No agencies need backfilling');
      return NextResponse.json({
        success: true,
        message: 'No agencies need trial subscriptions',
        count: 0
      });
    }

    console.log(`[Backfill] Found ${agencies.length} agencies without subscriptions`);

    // Create trial subscriptions for each agency
    const trialStart = new Date();
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const subscriptionsToCreate = agencies.map((agency: any) => ({
      agency_id: agency.id,
      status: 'trialing',
      plan_tier: 'starter',
      plan_name: '14-Day Free Trial',
      trial_start: trialStart.toISOString(),
      trial_end: trialEnd.toISOString(),
      current_period_start: trialStart.toISOString(),
      current_period_end: trialEnd.toISOString(),
      metadata: {
        created_via: 'backfill_api',
        auto_created: true,
        backfilled_at: new Date().toISOString()
      }
    }));

    const { data: createdSubscriptions, error: createError } = await sbAdmin
      .from('agency_subscriptions')
      .insert(subscriptionsToCreate)
      .select();

    if (createError) {
      console.error('[Backfill] Error creating subscriptions:', createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    console.log(`[Backfill] Successfully created ${createdSubscriptions?.length || 0} trial subscriptions`);

    // Reset discovery_status to 'pending' for agencies with 'skipped' status
    // This allows them to retry discovery with their new trial subscription
    const agencyIds = createdSubscriptions?.map((s: any) => s.agency_id) || [];

    if (agencyIds.length > 0) {
      const { data: resetAgencies, error: resetError } = await sbAdmin
        .from('agencies')
        .update({ discovery_status: 'pending' })
        .in('id', agencyIds)
        .eq('discovery_status', 'skipped')
        .select('id');

      if (resetError) {
        console.error('[Backfill] Error resetting discovery_status:', resetError);
      } else {
        console.log(`[Backfill] Reset discovery_status for ${resetAgencies?.length || 0} agencies from 'skipped' to 'pending'`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Backfilled ${createdSubscriptions?.length || 0} trial subscriptions`,
      count: createdSubscriptions?.length || 0,
      agencies: agencies.map((a: any) => ({ id: a.id, name: a.name }))
    });

  } catch (error: any) {
    console.error('[Backfill] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Backfill failed' },
      { status: 500 }
    );
  }
}
