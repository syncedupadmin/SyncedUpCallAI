'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { format } from 'date-fns';
import {
  Users,
  UserPlus,
  Mail,
  Calendar,
  Search,
  RefreshCw,
  Phone,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  role?: string;
  name?: string;
  phone?: string;
  user_level?: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'user'>('all');
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ email: '', name: '', phone: '' });
  const [currentUserLevel, setCurrentUserLevel] = useState<string>('');
  const supabase = createClient();

  useEffect(() => {
    checkUserLevel();
    fetchUsers();
  }, []);

  const checkUserLevel = async () => {
    try {
      const { data, error } = await supabase.rpc('get_user_level');
      if (!error && data) {
        setCurrentUserLevel(data);
      }
    } catch (error) {
      console.error('Error checking user level:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Fetch only regular users (operators can only see and manage regular users)
      const { data, error } = await supabase.rpc('get_users_by_level_v2', {
        level: 'user'
      });

      if (error) {
        console.error('Error fetching users:', error);
        return;
      }

      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAgent = async () => {
    if (!newAgent.email || !newAgent.name) {
      alert('Email and name are required');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('create_agent_user', {
        agent_email: newAgent.email,
        agent_name: newAgent.name,
        agent_phone: newAgent.phone || null
      });

      if (error) {
        alert(`Failed to create agent: ${error.message}`);
      } else {
        if (data?.signup_required) {
          alert('Agent profile created. User needs to sign up with this email to activate account.');
        } else {
          alert('Agent created successfully!');
        }
        setNewAgent({ email: '', name: '', phone: '' });
        setShowAddAgent(false);
        fetchUsers();
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };



  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  const stats = {
    total: users.length,
    recentlyActive: users.filter(u => {
      if (!u.last_sign_in_at) return false;
      const lastSignIn = new Date(u.last_sign_in_at);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return lastSignIn > dayAgo;
    }).length
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-400">Loading users...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent mb-2">
          Agent Management
        </h1>
        <p className="text-gray-400">Create and manage agent accounts</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Agents</div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Active (24h)</div>
          <div className="text-2xl font-bold text-green-400">{stats.recentlyActive}</div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="mb-6 flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition text-white placeholder-gray-500"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowAddAgent(true)}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-white transition flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Add Agent
          </button>

          <button
            onClick={fetchUsers}
            className="px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 rounded-lg text-gray-300 hover:text-white transition flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Add Agent Modal */}
      {showAddAgent && (
        <div className="mb-6 bg-orange-500/10 border border-orange-500/30 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Create New Agent</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email *</label>
              <input
                type="email"
                placeholder="agent@example.com"
                value={newAgent.email}
                onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Name *</label>
              <input
                type="text"
                placeholder="Agent Name"
                value={newAgent.name}
                onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Phone</label>
              <input
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={newAgent.phone}
                onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAddAgent}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-white transition"
            >
              Create Agent
            </button>
            <button
              onClick={() => {
                setShowAddAgent(false);
                setNewAgent({ email: '', name: '', phone: '' });
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50 border-b border-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Last Active
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-800/30 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-gray-600 to-gray-700 rounded-full flex items-center justify-center">
                          <Users className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{user.email}</div>
                          {user.name && (
                            <div className="text-xs text-gray-500">{user.name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
                        {user.phone || <span className="text-gray-500">No phone</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        {format(new Date(user.created_at), 'MMM dd, yyyy')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
                        {user.last_sign_in_at
                          ? format(new Date(user.last_sign_in_at), 'MMM dd, HH:mm')
                          : 'Never'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        View Only
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Box */}
      {currentUserLevel === 'admin' && (
        <div className="mt-6 bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-orange-400 mb-1">Agent Management Permissions</h4>
              <p className="text-xs text-gray-400">
                As an Operator Admin, you can create and view agent accounts. Agents will need to sign up with the email address you provide to activate their accounts.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}