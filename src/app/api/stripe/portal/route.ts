import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createPortalSession } from '@/lib/stripe/stripe-service';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await req.json();
    const { agencyId } = body;

    if (!agencyId) {
      return NextResponse.json(
        { error: 'Missing agency ID' },
        { status: 400 }
      );
    }

    // Verify user has access to this agency
    const { data: membership } = await supabase
      .from('user_agencies')
      .select('role')
      .eq('user_id', user.id)
      .eq('agency_id', agencyId)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'You must be an owner or admin to manage billing' },
        { status: 403 }
      );
    }

    // Get Stripe customer ID
    const { data: subscription } = await supabase
      .from('agency_subscriptions')
      .select('stripe_customer_id')
      .eq('agency_id', agencyId)
      .single();

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No subscription found for this agency' },
        { status: 404 }
      );
    }

    // Create portal session
    const session = await createPortalSession({
      customerId: subscription.stripe_customer_id,
      returnUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing`
    });

    return NextResponse.json({
      url: session.url
    });
  } catch (error: any) {
    console.error('Portal session error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create portal session' },
      { status: 500 }
    );
  }
}