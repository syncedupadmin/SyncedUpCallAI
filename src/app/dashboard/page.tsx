'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Phone,
  TrendingUp,
  Clock,
  Users,
  Activity,
  BarChart3,
  Calendar,
  ArrowRight,
  LogOut,
  Sparkles
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { UserNav } from '@/components/UserNav';
import { useAgencyContext, useCurrentAgency } from '@/contexts/AgencyContext';

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({
    totalCalls: 0,
    avgDuration: 0,
    todayCalls: 0,
    activeAgents: 0
  });
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();
  const router = useRouter();
  const { selectedAgencyId, loading: agencyLoading } = useAgencyContext();
  const currentAgency = useCurrentAgency();

  const fetchDashboardData = async () => {
    if (!selectedAgencyId) return;

    try {
      // Fetch calls data filtered by agency
      const { data: calls, error } = await supabase
        .from('calls')
        .select('*')
        .eq('agency_id', selectedAgencyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching calls:', error);
        return;
      }

      // Calculate stats
      const totalCalls = calls?.length || 0;
      const avgDuration = totalCalls > 0
        ? calls.reduce((acc: number, call: any) => acc + (call.duration || 0), 0) / totalCalls
        : 0;

      // Get today's calls
      const today = new Date().toDateString();
      const todayCalls = calls?.filter((call: any) =>
        new Date(call.created_at).toDateString() === today
      ).length || 0;

      // Get unique agents
      const uniqueAgents = new Set();
      calls?.forEach((call: any) => {
        if (call.agent_name) uniqueAgents.add(call.agent_name);
      });

      setStats({
        totalCalls,
        avgDuration: Math.round(avgDuration),
        todayCalls,
        activeAgents: uniqueAgents.size
      });

      // Get recent calls (last 10)
      setRecentCalls(calls?.slice(0, 10) || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  useEffect(() => {
    // Check authentication
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/');
      } else {
        setUser(user);
      }
    });
  }, []);

  // Fetch data when agency changes
  useEffect(() => {
    if (selectedAgencyId && !agencyLoading) {
      fetchDashboardData();
    }
  }, [selectedAgencyId, agencyLoading]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const statCards = [
    {
      icon: Phone,
      title: 'Total Calls',
      value: stats.totalCalls.toLocaleString(),
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      icon: Clock,
      title: 'Avg Duration',
      value: formatDuration(stats.avgDuration),
      color: 'from-purple-500 to-pink-500',
      bgColor: 'bg-purple-500/10'
    },
    {
      icon: Activity,
      title: "Today's Calls",
      value: stats.todayCalls.toLocaleString(),
      color: 'from-green-500 to-emerald-500',
      bgColor: 'bg-green-500/10'
    },
    {
      icon: Users,
      title: 'Active Agents',
      value: stats.activeAgents.toLocaleString(),
      color: 'from-orange-500 to-red-500',
      bgColor: 'bg-orange-500/10'
    }
  ];

  if (isLoading || agencyLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-900">
      <UserNav currentPath="/dashboard" />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome back, {user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'}!
          </h1>
          <p className="text-gray-400">
            {currentAgency
              ? `Viewing ${currentAgency.agency_name} performance overview`
              : 'Here\'s your call center performance overview'
            }
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative group"
            >
              <div className={`absolute inset-0 bg-gradient-to-r ${stat.color} opacity-0 group-hover:opacity-10 transition duration-300 rounded-xl blur-xl`} />
              <div className="relative bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition">
                <div className={`w-12 h-12 ${stat.bgColor} rounded-lg flex items-center justify-center mb-4`}>
                  <stat.icon className={`w-6 h-6 bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`} />
                </div>
                <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-gray-400 text-sm">{stat.title}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Recent Calls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gray-800/30 backdrop-blur-sm border border-gray-700 rounded-xl p-6"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white">Recent Calls</h2>
            <a
              href="/calls"
              className="flex items-center space-x-2 text-cyan-400 hover:text-cyan-300 transition"
            >
              <span>View All</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {recentCalls.length > 0 ? (
            <div className="space-y-3">
              {recentCalls.map((call, index) => (
                <motion.a
                  key={call.id}
                  href={`/calls/${call.id}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.05 }}
                  className="block p-4 bg-gray-900/50 rounded-lg hover:bg-gray-900/70 transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-white mb-1">
                        {call.customer_phone || call.phone_number || 'Unknown Number'}
                      </div>
                      <div className="text-sm text-gray-400">
                        Agent: {call.agent_name || call.agent || 'Unknown'} • {formatDuration(call.duration || 0)}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(call.created_at || call.date).toLocaleDateString()}
                    </div>
                  </div>
                </motion.a>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No calls recorded yet. Calls will appear here once they're processed.
            </div>
          )}
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="grid md:grid-cols-3 gap-6 mt-8"
        >
          <a
            href="/admin/analytics"
            className="group p-6 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl hover:border-cyan-500/40 transition"
          >
            <BarChart3 className="w-8 h-8 text-cyan-400 mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">View Analytics</h3>
            <p className="text-gray-400 text-sm">Detailed insights and performance metrics</p>
          </a>

          <a
            href="/kpi"
            className="group p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl hover:border-purple-500/40 transition"
          >
            <Calendar className="w-8 h-8 text-purple-400 mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">Generate Reports</h3>
            <p className="text-gray-400 text-sm">Custom reports and data exports</p>
          </a>

          <a
            href="/admin/super"
            className="group p-6 bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-xl hover:border-orange-500/40 transition"
          >
            <Users className="w-8 h-8 text-orange-400 mb-3" />
            <h3 className="text-lg font-semibold text-white mb-2">Admin Portal</h3>
            <p className="text-gray-400 text-sm">System settings and user management</p>
          </a>
        </motion.div>
      </div>

    </div>
  );
}