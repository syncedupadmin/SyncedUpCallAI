import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCheckoutSession } from '@/lib/stripe/stripe-service';
import { type PlanId } from '@/lib/stripe/config';

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
    const { planId, agencyId } = body;

    if (!planId || !agencyId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Check if agency already has an active subscription
    const { data: existingSubscription } = await supabase
      .from('agency_subscriptions')
      .select('status, stripe_customer_id')
      .eq('agency_id', agencyId)
      .single();

    if (existingSubscription?.status === 'active') {
      return NextResponse.json(
        { error: 'Agency already has an active subscription. Use the customer portal to manage it.' },
        { status: 400 }
      );
    }

    // Create Stripe checkout session
    const session = await createCheckoutSession({
      agencyId,
      planId: planId as PlanId,
      userId: user.id,
      userEmail: user.email!
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error: any) {
    console.error('Checkout session error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}