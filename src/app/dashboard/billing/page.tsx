'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Package,
  Check,
  X,
  AlertCircle,
  Loader2,
  TrendingUp,
  Calendar,
  BarChart3,
  Shield,
  Zap,
  Users,
  HardDrive,
  Phone,
  Clock
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PLANS, type PlanId } from '@/lib/stripe/config';
import toast from 'react-hot-toast';

interface Subscription {
  id: string;
  status: string;
  plan_tier: string;
  plan_name: string;
  current_period_start: string;
  current_period_end: string;
  trial_end: string;
  cancel_at_period_end: boolean;
  stripe_customer_id: string;
}

interface Usage {
  calls_processed: number;
  minutes_transcribed: number;
  storage_gb: number;
  team_members: number;
}

// Loading component
function BillingLoadingState() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
        <p className="mt-4 text-gray-400">Loading billing information...</p>
      </div>
    </div>
  );
}

// Main component wrapper with Suspense
export default function BillingPage() {
  return (
    <Suspense fallback={<BillingLoadingState />}>
      <BillingContent />
    </Suspense>
  );
}

// Actual billing content
function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    loadBillingData();
    checkUrlParams();
  }, []);

  const checkUrlParams = () => {
    // Handle Stripe checkout callbacks
    if (searchParams.get('success') === 'true') {
      toast.success('Subscription activated successfully!');
      router.replace('/dashboard/billing');
    }
    if (searchParams.get('canceled') === 'true') {
      toast.error('Checkout was canceled');
      router.replace('/dashboard/billing');
    }

    // Handle middleware redirects
    const message = searchParams.get('message');
    if (message === 'trial_expired') {
      toast.error('Your trial has expired. Please select a plan to continue using SyncedUp AI.', {
        duration: 6000,
        icon: '⏰'
      });
    } else if (message === 'subscription_inactive') {
      toast.error('Your subscription is inactive. Please update your payment method or select a new plan.', {
        duration: 6000,
        icon: '⚠️'
      });
    } else if (message === 'no_subscription') {
      toast.error('No active subscription found. Please select a plan to continue.', {
        duration: 6000,
        icon: '💳'
      });
    }
  };

  const loadBillingData = async () => {
    try {
      // Get user's agency
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from('user_agencies')
        .select('agency_id, role')
        .eq('user_id', user.id)
        .single();

      if (!membership) {
        toast.error('No agency found');
        return;
      }

      setAgencyId(membership.agency_id);

      // Load subscription
      const { data: sub } = await supabase
        .from('agency_subscriptions')
        .select('*')
        .eq('agency_id', membership.agency_id)
        .single();

      setSubscription(sub);

      // Load usage for current period
      const periodStart = new Date();
      periodStart.setDate(1);
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      periodEnd.setDate(0);

      const { data: usageData } = await supabase
        .from('usage_metrics')
        .select('*')
        .eq('agency_id', membership.agency_id)
        .gte('date', periodStart.toISOString())
        .lte('date', periodEnd.toISOString());

      // Aggregate usage
      if (usageData && usageData.length > 0) {
        const aggregated = usageData.reduce((acc, curr) => ({
          calls_processed: acc.calls_processed + (curr.calls_processed || 0),
          minutes_transcribed: acc.minutes_transcribed + (curr.minutes_transcribed || 0),
          storage_gb: Math.max(acc.storage_gb, curr.storage_gb || 0),
          team_members: Math.max(acc.team_members, curr.team_members || 0)
        }), {
          calls_processed: 0,
          minutes_transcribed: 0,
          storage_gb: 0,
          team_members: 0
        });
        setUsage(aggregated);
      } else {
        // Mock data for demo
        setUsage({
          calls_processed: 245,
          minutes_transcribed: 1230,
          storage_gb: 12.5,
          team_members: 3
        });
      }
    } catch (error) {
      console.error('Error loading billing data:', error);
      toast.error('Failed to load billing data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPlan = async (planId: PlanId) => {
    if (!agencyId) {
      toast.error('No agency found');
      return;
    }

    setSelectedPlan(planId);
    setIsProcessing(true);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, agencyId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      toast.error('Failed to start checkout process');
      setIsProcessing(false);
      setSelectedPlan(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!agencyId) {
      toast.error('No agency found');
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create portal session');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating portal session:', error);
      toast.error('Failed to open customer portal');
    } finally {
      setIsProcessing(false);
    }
  };

  const currentPlan = subscription?.plan_tier ?
    Object.values(PLANS).find(p => p.id === subscription.plan_tier) : null;

  if (isLoading) {
    return <BillingLoadingState />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Billing & Subscription
          </h1>
          <p className="mt-2 text-gray-400">
            Manage your subscription and billing settings
          </p>
        </div>

        {/* Current Plan Status */}
        {subscription && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800 p-6 mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Current Plan</h2>
              {subscription.status === 'active' && (
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                  Active
                </span>
              )}
              {subscription.status === 'trialing' && (
                <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                  Trial
                </span>
              )}
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <p className="text-gray-500 text-sm mb-1">Plan</p>
                <p className="text-2xl font-bold text-white capitalize">
                  {subscription.plan_name || 'No Plan'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm mb-1">Billing Period</p>
                <p className="text-lg text-white">
                  {subscription.current_period_end &&
                    `Until ${new Date(subscription.current_period_end).toLocaleDateString()}`
                  }
                </p>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleManageSubscription}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50"
                >
                  {isProcessing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Manage Subscription'
                  )}
                </button>
              </div>
            </div>

            {subscription.trial_end && new Date(subscription.trial_end) > new Date() && (
              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-blue-400 text-sm">
                  Trial ends on {new Date(subscription.trial_end).toLocaleDateString()}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* Usage Statistics */}
        {usage && currentPlan && (
          <div className="grid md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="w-5 h-5 text-cyan-500" />
                <span className="text-sm text-gray-400">Calls Processed</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {usage.calls_processed.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                of {(currentPlan.features.calls as number).toLocaleString()} limit
              </p>
              <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full"
                  style={{
                    width: `${Math.min((usage.calls_processed / (currentPlan.features.calls as number)) * 100, 100)}%`
                  }}
                />
              </div>
            </div>

            <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-green-500" />
                <span className="text-sm text-gray-400">Minutes Transcribed</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {usage.minutes_transcribed.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                of {(currentPlan.features.transcriptionMinutes as number).toLocaleString()} limit
              </p>
              <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-cyan-500 rounded-full"
                  style={{
                    width: `${Math.min((usage.minutes_transcribed / (currentPlan.features.transcriptionMinutes as number)) * 100, 100)}%`
                  }}
                />
              </div>
            </div>

            <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="w-5 h-5 text-purple-500" />
                <span className="text-sm text-gray-400">Storage Used</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {usage.storage_gb.toFixed(1)} GB
              </p>
              <p className="text-xs text-gray-500 mt-1">
                of {currentPlan.features.storage as number} GB limit
              </p>
              <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                  style={{
                    width: `${Math.min((usage.storage_gb / (currentPlan.features.storage as number)) * 100, 100)}%`
                  }}
                />
              </div>
            </div>

            <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-orange-500" />
                <span className="text-sm text-gray-400">Team Members</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {usage.team_members}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                of {currentPlan.features.teamMembers as number} limit
              </p>
              <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full"
                  style={{
                    width: `${Math.min((usage.team_members / (currentPlan.features.teamMembers as number)) * 100, 100)}%`
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Pricing Plans */}
        <h2 className="text-2xl font-bold text-white mb-6">
          {subscription?.status === 'active' ? 'Upgrade Your Plan' : 'Choose Your Plan'}
        </h2>

        <div className="grid md:grid-cols-3 gap-6">
          {Object.entries(PLANS).filter(([planId, plan]) => planId !== 'enterprise').map(([planId, plan]) => {
            const isCurrentPlan = subscription?.plan_tier === planId;
            const isProcessingPlan = selectedPlan === planId && isProcessing;

            return (
              <motion.div
                key={planId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative bg-gray-900/50 backdrop-blur-xl rounded-2xl border ${
                  (plan as any).popular ? 'border-cyan-500' : 'border-gray-800'
                } p-6`}
              >
                {(plan as any).popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-xs rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-gray-400 text-sm mb-4">{plan.description}</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-white">${plan.price}</span>
                    <span className="text-gray-500 mb-1">/month</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-300">
                      {(plan.features.calls as number).toLocaleString()} calls/month
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-300">
                      {(plan.features.transcriptionMinutes as number).toLocaleString()} transcription minutes
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-300">
                      {plan.features.teamMembers as number} team members
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-300">
                      {plan.features.storage as number} GB storage
                    </span>
                  </li>
                  {plan.features.apiAccess && (
                    <li className="flex items-start gap-2">
                      <Zap className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-300">API Access</span>
                    </li>
                  )}
                  {plan.features.advancedAnalytics && (
                    <li className="flex items-start gap-2">
                      <BarChart3 className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-300">Advanced Analytics</span>
                    </li>
                  )}
                </ul>

                <button
                  onClick={() => handleSelectPlan(planId as PlanId)}
                  disabled={isCurrentPlan || isProcessing}
                  className={`w-full py-3 rounded-lg font-semibold transition ${
                    isCurrentPlan
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      : (plan as any).popular
                      ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:shadow-lg hover:shadow-cyan-500/25'
                      : 'bg-gray-800 text-white hover:bg-gray-700'
                  }`}
                >
                  {isCurrentPlan ? (
                    'Current Plan'
                  ) : isProcessingPlan ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    'Get Started'
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* Enterprise Plan */}
        <div className="mt-8 bg-gradient-to-r from-purple-900/20 to-pink-900/20 backdrop-blur-xl rounded-2xl border border-purple-500/30 p-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">Enterprise</h3>
              <p className="text-gray-300">
                Custom solutions for large organizations with unlimited usage and dedicated support.
              </p>
            </div>
            <a
              href="mailto:sales@syncedupsolutions.com?subject=Enterprise%20Plan%20Inquiry"
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/25 transition"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}