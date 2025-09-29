import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, syncSubscriptionFromStripe } from '@/lib/stripe/stripe-service';
import { sbAdmin } from '@/lib/supabase-admin';
import { getPlanByPriceId } from '@/lib/stripe/config';

// Webhook secret from Stripe Dashboard
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  // Log the event
  await sbAdmin.from('billing_events').insert({
    event_type: event.type,
    event_data: event.data.object,
    stripe_event_id: event.id,
    created_at: new Date().toISOString()
  });

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleTrialWillEnd(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      case 'payment_method.attached': {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        await handlePaymentMethodAttached(paymentMethod);
        break;
      }

      case 'payment_method.detached': {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        await handlePaymentMethodDetached(paymentMethod);
        break;
      }

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    // Mark event as processed
    await sbAdmin
      .from('billing_events')
      .update({ processed: true })
      .eq('stripe_event_id', event.id);

  } catch (error: any) {
    console.error(`Error processing webhook ${event.type}:`, error);

    // Log error
    await sbAdmin
      .from('billing_events')
      .update({
        processed: false,
        error: error.message
      })
      .eq('stripe_event_id', event.id);

    // Return 200 to acknowledge receipt even if processing failed
    // This prevents Stripe from retrying
  }

  return NextResponse.json({ received: true });
}

// Handler functions
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const agencyId = session.metadata?.agency_id || session.client_reference_id;
  if (!agencyId) {
    console.error('No agency_id in checkout session');
    return;
  }

  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;

  // Update or create subscription record
  await sbAdmin
    .from('agency_subscriptions')
    .upsert({
      agency_id: agencyId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: 'active',
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'agency_id'
    });

  // Sync full subscription details
  await syncSubscriptionFromStripe(subscriptionId);

  console.log(`Checkout completed for agency ${agencyId}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const agencyId = subscription.metadata?.agency_id;
  if (!agencyId) {
    console.error('No agency_id in subscription metadata');
    return;
  }

  const plan = getPlanByPriceId(subscription.items.data[0].price.id);

  // Cast subscription properties that TypeScript doesn't recognize
  const sub = subscription as any;

  await sbAdmin
    .from('agency_subscriptions')
    .update({
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscription.items.data[0].price.id,
      status: subscription.status,
      plan_tier: plan?.id || null,
      plan_name: plan?.name || null,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      trial_start: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      metadata: subscription.metadata,
      updated_at: new Date().toISOString()
    })
    .eq('stripe_customer_id', subscription.customer);

  console.log(`Subscription updated for customer ${subscription.customer}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await sbAdmin
    .from('agency_subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('stripe_subscription_id', subscription.id);

  console.log(`Subscription canceled for ${subscription.id}`);
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const agencyId = subscription.metadata?.agency_id;
  if (!agencyId) return;

  // Get agency owner email
  const { data: agency } = await sbAdmin
    .from('agencies')
    .select('owner_user_id')
    .eq('id', agencyId)
    .single();

  if (agency) {
    const { data: userData } = await sbAdmin.auth.admin.getUserById(agency.owner_user_id);

    // TODO: Send email notification about trial ending
    console.log(`Trial ending soon for agency ${agencyId}, user: ${userData?.user?.email}`);
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Update last payment date
  await sbAdmin
    .from('agency_subscriptions')
    .update({
      metadata: sbAdmin.rpc('jsonb_merge', {
        target: 'metadata',
        source: JSON.stringify({
          last_payment_date: new Date().toISOString(),
          last_payment_amount: invoice.amount_paid
        })
      }),
      updated_at: new Date().toISOString()
    })
    .eq('stripe_customer_id', customerId);

  console.log(`Payment succeeded for customer ${customerId}`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Update subscription status to past_due
  await sbAdmin
    .from('agency_subscriptions')
    .update({
      status: 'past_due',
      metadata: sbAdmin.rpc('jsonb_merge', {
        target: 'metadata',
        source: JSON.stringify({
          last_failed_payment: new Date().toISOString(),
          failed_payment_amount: invoice.amount_due
        })
      }),
      updated_at: new Date().toISOString()
    })
    .eq('stripe_customer_id', customerId);

  // Get agency owner email for notification
  const { data: subscription } = await sbAdmin
    .from('agency_subscriptions')
    .select('agency_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (subscription) {
    const { data: agency } = await sbAdmin
      .from('agencies')
      .select('owner_user_id')
      .eq('id', subscription.agency_id)
      .single();

    if (agency) {
      const { data: userData } = await sbAdmin.auth.admin.getUserById(agency.owner_user_id);
      // TODO: Send payment failed notification
      console.log(`Payment failed for agency ${subscription.agency_id}, user: ${userData?.user?.email}`);
    }
  }
}

async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
  const customerId = paymentMethod.customer as string;

  // Get agency_id from customer
  const { data: subscription } = await sbAdmin
    .from('agency_subscriptions')
    .select('agency_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (subscription) {
    // Check if this is the only payment method (make it default)
    const { count } = await sbAdmin
      .from('payment_methods')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', subscription.agency_id);

    const isDefault = count === 0;

    // Save payment method
    await sbAdmin.from('payment_methods').insert({
      agency_id: subscription.agency_id,
      stripe_payment_method_id: paymentMethod.id,
      type: paymentMethod.type,
      last4: paymentMethod.card?.last4 || null,
      brand: paymentMethod.card?.brand || null,
      exp_month: paymentMethod.card?.exp_month || null,
      exp_year: paymentMethod.card?.exp_year || null,
      is_default: isDefault,
      created_at: new Date().toISOString()
    });

    console.log(`Payment method attached for agency ${subscription.agency_id}`);
  }
}

async function handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod) {
  // Remove payment method from database
  await sbAdmin
    .from('payment_methods')
    .delete()
    .eq('stripe_payment_method_id', paymentMethod.id);

  console.log(`Payment method ${paymentMethod.id} detached`);
}

// Disable body parser for webhook route to get raw body
export const runtime = 'edge';