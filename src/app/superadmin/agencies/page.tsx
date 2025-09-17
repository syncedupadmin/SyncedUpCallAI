'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { format } from 'date-fns';
import {
  Users,
  UserPlus,
  Shield,
  Crown,
  Mail,
  Calendar,
  Search,
  ChevronDown,
  Check,
  X,
  RefreshCw,
  UserCheck,
  UserX,
  Phone,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  role?: string;
  user_level: string;
  created_at: string;
  last_sign_in_at?: string;
}

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [showAddUser, setShowAddUser] = useState(false);
  const [showChangeLevel, setShowChangeLevel] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ email: '', name: '', phone: '', type: 'agent' });
  const supabase = createClient();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Use the simplified get_users_by_level function
      const { data: allUsers } = await supabase
        .rpc('get_users_by_level', { level_filter: 'user' });

      const { data: admins } = await supabase
        .rpc('get_users_by_level', { level_filter: 'admin' });

      // Combine all users (now only 2 types)
      const data = [...(allUsers || []), ...(admins || [])];
      const error = null;

      if (error) {
        console.error('Error fetching users:', error);
        toast.error('Failed to fetch users');
        return;
      }

      setUsers(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.name) {
      toast.error('Email and name are required');
      return;
    }

    try {
      if (newUser.type === 'agent') {
        // Create agent user
        const { data, error } = await supabase.rpc('create_agent_user', {
          agent_email: newUser.email,
          agent_name: newUser.name,
          agent_phone: newUser.phone || null
        });

        if (error) throw error;

        if (data?.signup_required) {
          toast.success('Profile created. User needs to sign up with this email to activate account.');
        } else {
          toast.success('User profile updated successfully');
        }
      } else {
        // For admin/super admin, first create the profile then set the level
        const { data: profileData, error: profileError } = await supabase.rpc('create_agent_user', {
          agent_email: newUser.email,
          agent_name: newUser.name,
          agent_phone: newUser.phone || null
        });

        if (profileError) throw profileError;

        // Set admin level (all admins are now equal)
        const { error: levelError } = await supabase.rpc('set_admin_level', {
          user_email: newUser.email,
          new_level: 'admin'
        });

        if (levelError) throw levelError;

        toast.success('Admin created successfully');
      }

      setShowAddUser(false);
      setNewUser({ email: '', name: '', phone: '', type: 'agent' });
      fetchUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(error.message || 'Failed to create user');
    }
  };

  const handleChangeLevel = async (email: string, newLevel: 'admin' | 'remove') => {
    try {
      const { error } = await supabase.rpc('set_admin_level', {
        user_email: email,
        new_level: newLevel
      });

      if (error) throw error;

      const message = newLevel === 'remove'
        ? 'Admin privileges removed'
        : 'User promoted to admin';

      toast.success(message);
      setShowChangeLevel(null);
      fetchUsers();
    } catch (error: any) {
      console.error('Error changing level:', error);
      toast.error(error.message || 'Failed to change user level');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filter === 'all' ||
      (filter === 'admin' && (user.user_level === 'admin' || user.user_level === 'super_admin')) ||
      (filter === 'user' && user.user_level === 'user');

    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: users.length,
    admins: users.filter(u => u.user_level === 'admin' || u.user_level === 'super_admin').length,
    regularUsers: users.filter(u => u.user_level === 'user').length
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
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent mb-2">
          Admin User Management
        </h1>
        <p className="text-gray-400">Manage all users and their access levels</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Users</div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Admins</div>
          <div className="text-2xl font-bold text-purple-400">{stats.admins}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Users</div>
          <div className="text-2xl font-bold text-blue-400">{stats.regularUsers}</div>
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
            className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition text-white placeholder-gray-500"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1">
            {(['all', 'admin', 'user'] as const).map((filterOption) => (
              <button
                key={filterOption}
                onClick={() => setFilter(filterOption)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  filter === filterOption
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                {filterOption === 'all' ? 'All' :
                 filterOption === 'admin' ? 'Admins' : 'Users'}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddUser(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Add User
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

      {/* Add User Modal */}
      {showAddUser && (
        <div className="mb-6 bg-purple-500/10 border border-purple-500/30 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Create New User</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email *</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Name *</label>
              <input
                type="text"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Phone</label>
              <input
                type="tel"
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">User Type *</label>
              <select
                value={newUser.type}
                onChange={(e) => setNewUser({ ...newUser, type: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:border-purple-500 focus:outline-none"
              >
                <option value="agent">Regular User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCreateUser}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition"
            >
              Create User
            </button>
            <button
              onClick={() => {
                setShowAddUser(false);
                setNewUser({ email: '', name: '', phone: '', type: 'agent' });
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
                  Level
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Contact
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
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-800/30 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          user.user_level === 'admin' || user.user_level === 'super_admin'
                            ? 'bg-gradient-to-br from-purple-600 to-pink-600'
                            : 'bg-gradient-to-br from-gray-600 to-gray-700'
                        }`}>
                          {user.user_level === 'admin' || user.user_level === 'super_admin' ? (
                            <Shield className="w-5 h-5 text-white" />
                          ) : (
                            <Users className="w-5 h-5 text-white" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{user.name || 'No Name'}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.user_level === 'admin' || user.user_level === 'super_admin'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {(user.user_level === 'admin' || user.user_level === 'super_admin') && <Shield className="w-3 h-3" />}
                        {user.user_level === 'admin' || user.user_level === 'super_admin' ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
                        {user.phone ? (
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-500" />
                            {user.phone}
                          </div>
                        ) : (
                          <span className="text-gray-500">No phone</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        {user.created_at
                          ? format(new Date(user.created_at), 'MMM dd, yyyy')
                          : 'N/A'}
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
                      <div className="relative">
                        {showChangeLevel === user.email ? (
                          <div className="absolute right-0 top-0 z-10 bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-2 min-w-[200px]">
                            <div className="text-xs text-gray-400 mb-2">Change Level for {user.email}</div>
                            {user.user_level === 'user' && (
                              <button
                                onClick={() => handleChangeLevel(user.email, 'admin')}
                                className="w-full text-left px-3 py-1.5 text-sm text-purple-400 hover:bg-purple-500/20 rounded transition flex items-center gap-2"
                              >
                                <Shield className="w-4 h-4" />
                                Promote to Admin
                              </button>
                            )}
                            {(user.user_level === 'admin' || user.user_level === 'super_admin') && (
                              <button
                                onClick={() => handleChangeLevel(user.email, 'remove')}
                                className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20 rounded transition flex items-center gap-2"
                              >
                                <UserX className="w-4 h-4" />
                                Remove Admin Access
                              </button>
                            )}
                            <button
                              onClick={() => setShowChangeLevel(null)}
                              className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-700 rounded transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowChangeLevel(user.email)}
                            className="px-3 py-1.5 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition flex items-center gap-1"
                          >
                            Change Level
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        )}
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
      <div className="mt-6 bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-purple-400 mb-1">User Roles</h4>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>• <span className="text-purple-400">Admins</span>: Full access to admin portal and can manage all users</li>
              <li>• <span className="text-blue-400">Users</span>: Regular users with access to the standard dashboard</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}