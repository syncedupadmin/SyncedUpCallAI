'use client';

import { useState, useEffect } from 'react';
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

export default function BillingPage() {
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
        .from('usage_records')
        .select('metric_name, quantity')
        .eq('agency_id', membership.agency_id)
        .gte('period_start', periodStart.toISOString())
        .lte('period_end', periodEnd.toISOString());

      // Aggregate usage
      const usageMap: Usage = {
        calls_processed: 0,
        minutes_transcribed: 0,
        storage_gb: 0,
        team_members: 0
      };

      usageData?.forEach(record => {
        if (record.metric_name in usageMap) {
          usageMap[record.metric_name as keyof Usage] += record.quantity;
        }
      });

      // Get team member count
      const { count: teamCount } = await supabase
        .from('user_agencies')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', membership.agency_id);

      usageMap.team_members = teamCount || 0;

      setUsage(usageMap);
    } catch (error) {
      console.error('Error loading billing data:', error);
      toast.error('Failed to load billing information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPlan = async (planId: PlanId) => {
    if (!agencyId) {
      toast.error('No agency selected');
      return;
    }

    setIsProcessing(true);
    setSelectedPlan(planId);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, agencyId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast.error(error.message || 'Failed to start checkout');
      setIsProcessing(false);
      setSelectedPlan(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!agencyId) return;

    setIsProcessing(true);

    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error);
      }

      // Redirect to Stripe Customer Portal
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error('Portal error:', error);
      toast.error(error.message || 'Failed to open billing portal');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getDaysUntilTrialEnd = () => {
    if (!subscription?.trial_end) return null;
    const days = Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  const currentPlan = subscription ? PLANS[subscription.plan_tier as PlanId] : null;
  const trialDays = getDaysUntilTrialEnd();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Billing & Subscription</h1>
        <p className="text-gray-400">Manage your subscription and view usage</p>
      </div>

      {/* Current Plan */}
      {subscription && (
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800 p-6 mb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Package className="w-6 h-6 text-cyan-500" />
                <h2 className="text-xl font-semibold text-white">Current Plan</h2>
                {subscription.status === 'trialing' && trialDays !== null && (
                  <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                    Trial - {trialDays} days left
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-white mb-1">{subscription.plan_name || 'No Plan'}</p>
              <p className="text-sm text-gray-400">
                {subscription.status === 'active' && (
                  <>Renews on {formatDate(subscription.current_period_end)}</>
                )}
                {subscription.cancel_at_period_end && (
                  <span className="text-red-400"> • Cancels at period end</span>
                )}
              </p>
            </div>
            {subscription.stripe_customer_id && (
              <button
                onClick={handleManageSubscription}
                disabled={isProcessing}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition text-white disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Manage Subscription'
                )}
              </button>
            )}
          </div>
        </div>
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
              of {currentPlan.features.calls.toLocaleString()} limit
            </p>
            <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full"
                style={{
                  width: `${Math.min(100, (usage.calls_processed / (currentPlan.features.calls as number)) * 100)}%`
                }}
              />
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-purple-500" />
              <span className="text-sm text-gray-400">Minutes Transcribed</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {usage.minutes_transcribed.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              of {currentPlan.features.transcriptionMinutes.toLocaleString()} limit
            </p>
            <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                style={{
                  width: `${Math.min(100, (usage.minutes_transcribed / (currentPlan.features.transcriptionMinutes as number)) * 100)}%`
                }}
              />
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-green-500" />
              <span className="text-sm text-gray-400">Team Members</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {usage.team_members}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              of {currentPlan.features.teamMembers} limit
            </p>
            <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"
                style={{
                  width: `${Math.min(100, (usage.team_members / (currentPlan.features.teamMembers as number)) * 100)}%`
                }}
              />
            </div>
          </div>

          <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive className="w-5 h-5 text-orange-500" />
              <span className="text-sm text-gray-400">Storage Used</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {usage.storage_gb} GB
            </p>
            <p className="text-xs text-gray-500 mt-1">
              of {currentPlan.features.storage} GB limit
            </p>
            <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
                style={{
                  width: `${Math.min(100, (usage.storage_gb / (currentPlan.features.storage as number)) * 100)}%`
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Pricing Plans */}
      <div className="mb-8">
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
                    <span className="text-gray-400 mb-1">/month</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-500 mt-0.5" />
                    <span className="text-gray-300 text-sm">
                      {plan.features.calls.toLocaleString()} calls/month
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-500 mt-0.5" />
                    <span className="text-gray-300 text-sm">
                      {plan.features.transcriptionMinutes.toLocaleString()} transcription minutes
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-500 mt-0.5" />
                    <span className="text-gray-300 text-sm">
                      {plan.features.teamMembers} team members
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-green-500 mt-0.5" />
                    <span className="text-gray-300 text-sm">
                      {plan.features.storage} GB storage
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.apiAccess ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <X className="w-5 h-5 text-gray-600" />
                    )}
                    <span className={`text-sm ${plan.features.apiAccess ? 'text-gray-300' : 'text-gray-600'}`}>
                      API Access
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    {plan.features.advancedAnalytics ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <X className="w-5 h-5 text-gray-600" />
                    )}
                    <span className={`text-sm ${plan.features.advancedAnalytics ? 'text-gray-300' : 'text-gray-600'}`}>
                      Advanced Analytics
                    </span>
                  </li>
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
                    'Select Plan'
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* Enterprise Plan */}
        <div className="mt-6 bg-gradient-to-r from-gray-900/50 to-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700 p-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">Enterprise</h3>
              <p className="text-gray-400">
                Custom solutions for large organizations with unlimited usage and dedicated support
              </p>
            </div>
            <a
              href="mailto:sales@syncedupsolutions.com?subject=Enterprise Plan Inquiry"
              className="px-6 py-3 bg-white text-gray-900 rounded-lg font-semibold hover:bg-gray-100 transition"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </div>

      {/* No Active Subscription Warning */}
      {(!subscription || !['active', 'trialing'].includes(subscription.status)) && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
          <div>
            <p className="text-red-400 font-semibold">No Active Subscription</p>
            <p className="text-sm text-red-400/80 mt-1">
              Please select a plan to continue using SyncedUp AI.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}