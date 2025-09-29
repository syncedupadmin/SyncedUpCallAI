'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CreditCard,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Users,
  Building2,
  Package,
  AlertTriangle,
  Search,
  Filter
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

interface AgencySubscription {
  id: string;
  agency_id: string;
  agencies: {
    name: string;
    created_at: string;
  };
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: string;
  plan_tier: string;
  plan_name: string;
  current_period_start: string;
  current_period_end: string;
  trial_start: string;
  trial_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string;
  created_at: string;
  updated_at: string;
}

interface BillingStats {
  total_agencies: number;
  active_subscriptions: number;
  trialing: number;
  past_due: number;
  canceled: number;
  monthly_recurring_revenue: number;
  annual_recurring_revenue: number;
}

export default function SuperAdminBillingPage() {
  const [subscriptions, setSubscriptions] = useState<AgencySubscription[]>([]);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const supabase = createClient();

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    try {
      // Load all agency subscriptions
      const { data: subs, error: subsError } = await supabase
        .from('agency_subscriptions')
        .select(`
          *,
          agencies!inner (
            name,
            created_at
          )
        `)
        .order('created_at', { ascending: false });

      if (subsError) throw subsError;
      setSubscriptions(subs || []);

      // Calculate statistics
      if (subs) {
        const stats: BillingStats = {
          total_agencies: subs.length,
          active_subscriptions: subs.filter(s => s.status === 'active').length,
          trialing: subs.filter(s => s.status === 'trialing').length,
          past_due: subs.filter(s => s.status === 'past_due').length,
          canceled: subs.filter(s => s.status === 'canceled').length,
          monthly_recurring_revenue: 0,
          annual_recurring_revenue: 0
        };

        // Calculate MRR based on plan tiers
        const planPrices: Record<string, number> = {
          starter: 297,
          growth: 597,
          scale: 997,
          enterprise: 2997 // Estimate for enterprise
        };

        subs.forEach(sub => {
          if (sub.status === 'active' && sub.plan_tier) {
            const monthlyPrice = planPrices[sub.plan_tier] || 0;
            stats.monthly_recurring_revenue += monthlyPrice;
          }
        });

        stats.annual_recurring_revenue = stats.monthly_recurring_revenue * 12;
        setStats(stats);
      }
    } catch (error) {
      console.error('Error loading billing data:', error);
      toast.error('Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-400 bg-green-500/10 border-green-500/30';
      case 'trialing':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'past_due':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'canceled':
      case 'incomplete_expired':
        return 'text-red-400 bg-red-500/10 border-red-500/30';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4" />;
      case 'trialing':
        return <Clock className="w-4 h-4" />;
      case 'past_due':
        return <AlertTriangle className="w-4 h-4" />;
      case 'canceled':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const filteredSubscriptions = subscriptions.filter(sub => {
    const matchesSearch = sub.agencies.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          sub.stripe_customer_id?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading billing data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Billing & Subscriptions
        </h1>
        <p className="mt-2 text-gray-400">
          Manage all agency subscriptions and billing across the platform
        </p>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Agencies</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {stats.total_agencies}
                </p>
              </div>
              <Building2 className="w-8 h-8 text-purple-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Active Subscriptions</p>
                <p className="text-2xl font-bold text-green-400 mt-1">
                  {stats.active_subscriptions}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.trialing} trialing
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Monthly Recurring</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">
                  {formatCurrency(stats.monthly_recurring_revenue)}
                </p>
                <p className="text-xs text-gray-500 mt-1">MRR</p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Annual Recurring</p>
                <p className="text-2xl font-bold text-purple-400 mt-1">
                  {formatCurrency(stats.annual_recurring_revenue)}
                </p>
                <p className="text-xs text-gray-500 mt-1">ARR</p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-500" />
            </div>
          </motion.div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by agency name or customer ID..."
                className="w-full pl-10 pr-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              className="px-4 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="past_due">Past Due</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900/50 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Agency
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Customer ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredSubscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-900/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Building2 className="w-5 h-5 text-gray-500 mr-3" />
                      <div>
                        <div className="text-sm font-medium text-white">
                          {sub.agencies.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          ID: {sub.agency_id.slice(0, 8)}...
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Package className="w-4 h-4 text-purple-500 mr-2" />
                      <span className="text-sm text-white capitalize">
                        {sub.plan_tier || 'No Plan'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(sub.status)}`}>
                      {getStatusIcon(sub.status)}
                      {sub.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    {sub.current_period_end ? (
                      <div>
                        <div>{new Date(sub.current_period_end).toLocaleDateString()}</div>
                        {sub.trial_end && new Date(sub.trial_end) > new Date() && (
                          <div className="text-xs text-blue-400">
                            Trial ends: {new Date(sub.trial_end).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-xs text-gray-500 font-mono">
                      {sub.stripe_customer_id ? (
                        <>
                          {sub.stripe_customer_id.slice(0, 14)}...
                        </>
                      ) : (
                        <span className="text-gray-600">No customer</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {sub.stripe_customer_id && (
                      <a
                        href={`https://dashboard.stripe.com${process.env.NODE_ENV === 'production' ? '' : '/test'}/customers/${sub.stripe_customer_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        View in Stripe →
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredSubscriptions.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-700" />
              <p>No subscriptions found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}