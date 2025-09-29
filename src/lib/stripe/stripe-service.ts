/**
 * Stripe Service - Core billing functionality
 */

import Stripe from 'stripe';
import { sbAdmin } from '@/lib/supabase-admin';
import { PLANS, STRIPE_CONFIG, type PlanId } from './config';

// Initialize Stripe (with fallback for build time)
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_for_build';
const stripe = new Stripe(stripeKey, {
  apiVersion: STRIPE_CONFIG.apiVersion,
  typescript: true
});

// Types
export interface CreateCheckoutSessionParams {
  agencyId: string;
  planId: PlanId;
  userId: string;
  userEmail: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CreatePortalSessionParams {
  customerId: string;
  returnUrl: string;
}

export interface SubscriptionDetails {
  id: string;
  status: Stripe.Subscription.Status;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  plan: {
    id: string;
    name: string;
    amount: number;
    interval: string;
  };
}

/**
 * Create or get Stripe customer for an agency
 */
export async function getOrCreateStripeCustomer(
  agencyId: string,
  email: string,
  name?: string
): Promise<string> {
  try {
    // Check if agency already has a Stripe customer
    const { data: subscription } = await sbAdmin
      .from('agency_subscriptions')
      .select('stripe_customer_id')
      .eq('agency_id', agencyId)
      .single();

    if (subscription?.stripe_customer_id) {
      return subscription.stripe_customer_id;
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        agency_id: agencyId,
        environment: process.env.NODE_ENV || 'production'
      }
    });

    // Save customer ID to database
    await sbAdmin.from('agency_subscriptions').insert({
      agency_id: agencyId,
      stripe_customer_id: customer.id,
      status: 'incomplete',
      created_at: new Date().toISOString()
    });

    return customer.id;
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    throw error;
  }
}

/**
 * Create Stripe Checkout Session for subscription
 */
export async function createCheckoutSession({
  agencyId,
  planId,
  userId,
  userEmail,
  successUrl,
  cancelUrl
}: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
  try {
    // Get or create customer
    const { data: agency } = await sbAdmin
      .from('agencies')
      .select('name')
      .eq('id', agencyId)
      .single();

    const customerId = await getOrCreateStripeCustomer(
      agencyId,
      userEmail,
      agency?.name
    );

    const plan = PLANS[planId];
    if (!plan || !plan.priceId) {
      throw new Error(`Invalid plan: ${planId}`);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.priceId,
          quantity: 1
        }
      ],
      subscription_data: {
        trial_period_days: STRIPE_CONFIG.trialDays,
        metadata: {
          agency_id: agencyId,
          user_id: userId,
          plan_id: planId
        }
      },
      client_reference_id: agencyId,
      success_url: successUrl || `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?canceled=true`,
      metadata: {
        agency_id: agencyId,
        user_id: userId,
        plan_id: planId
      }
    });

    return session;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
}

/**
 * Create Stripe Customer Portal session for managing subscription
 */
export async function createPortalSession({
  customerId,
  returnUrl
}: CreatePortalSessionParams): Promise<Stripe.BillingPortal.Session> {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing`
    });

    return session;
  } catch (error) {
    console.error('Error creating portal session:', error);
    throw error;
  }
}

/**
 * Cancel subscription at period end
 */
export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    // Update database
    await sbAdmin
      .from('agency_subscriptions')
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscriptionId);

    return subscription;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

/**
 * Resume canceled subscription
 */
export async function resumeSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    });

    // Update database
    await sbAdmin
      .from('agency_subscriptions')
      .update({
        cancel_at_period_end: false,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscriptionId);

    return subscription;
  } catch (error) {
    console.error('Error resuming subscription:', error);
    throw error;
  }
}

/**
 * Update subscription plan
 */
export async function updateSubscriptionPlan(
  subscriptionId: string,
  newPlanId: PlanId
): Promise<Stripe.Subscription> {
  try {
    const plan = PLANS[newPlanId];
    if (!plan || !plan.priceId) {
      throw new Error(`Invalid plan: ${newPlanId}`);
    }

    // Get current subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Update subscription
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: plan.priceId
        }
      ],
      proration_behavior: 'create_prorations',
      metadata: {
        ...subscription.metadata,
        plan_id: newPlanId
      }
    });

    // Update database
    await sbAdmin
      .from('agency_subscriptions')
      .update({
        plan_tier: newPlanId,
        plan_name: plan.name,
        stripe_price_id: plan.priceId,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscriptionId);

    return updatedSubscription;
  } catch (error) {
    console.error('Error updating subscription plan:', error);
    throw error;
  }
}

/**
 * Report usage for metered billing
 * NOTE: This function is for metered billing which requires specific Stripe configuration
 * Commented out until metered billing is needed
 */
// export async function reportUsage(
//   subscriptionItemId: string,
//   quantity: number,
//   timestamp?: number
// ): Promise<any> {
//   try {
//     // Note: createUsageRecord requires metered pricing setup in Stripe
//     // This will need to be implemented when metered billing is configured
//     throw new Error('Metered billing not yet implemented');
//   } catch (error) {
//     console.error('Error reporting usage:', error);
//     throw error;
//   }
// }

/**
 * Get subscription details
 */
export async function getSubscriptionDetails(subscriptionId: string): Promise<SubscriptionDetails | null> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product']
    });

    const price = subscription.items.data[0].price;
    const product = price.product as Stripe.Product;
    const sub = subscription as any;

    return {
      id: subscription.id,
      status: subscription.status,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      plan: {
        id: price.id,
        name: product.name,
        amount: price.unit_amount || 0,
        interval: price.recurring?.interval || 'month'
      }
    };
  } catch (error) {
    console.error('Error getting subscription details:', error);
    return null;
  }
}

/**
 * Sync subscription status from Stripe
 */
export async function syncSubscriptionFromStripe(subscriptionId: string): Promise<void> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const sub = subscription as any;

    const plan = Object.values(PLANS).find(p =>
      p.priceId === subscription.items.data[0].price.id
    );

    await sbAdmin
      .from('agency_subscriptions')
      .update({
        status: subscription.status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        trial_start: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
        trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end,
        canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
        plan_tier: plan?.id || null,
        plan_name: plan?.name || null,
        stripe_price_id: subscription.items.data[0].price.id,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscriptionId);
  } catch (error) {
    console.error('Error syncing subscription from Stripe:', error);
    throw error;
  }
}

/**
 * Check if agency has active subscription
 */
export async function hasActiveSubscription(agencyId: string): Promise<boolean> {
  try {
    const { data } = await sbAdmin
      .from('agency_subscriptions')
      .select('status')
      .eq('agency_id', agencyId)
      .single();

    return data?.status === 'active' || data?.status === 'trialing';
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
}

// Export stripe instance for webhook handling
export { stripe };