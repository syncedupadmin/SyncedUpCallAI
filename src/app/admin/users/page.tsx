'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { format } from 'date-fns';
import {
  Users,
  UserPlus,
  Shield,
  Mail,
  Calendar,
  Search,
  Edit,
  Trash2,
  Check,
  X,
  RefreshCw,
  UserCheck,
  UserX
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  role?: string;
  name?: string;
  phone?: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [admins, setAdmins] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const supabase = createClient();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        return;
      }

      // Fetch admin users
      const { data: adminUsers, error: adminError } = await supabase
        .from('admin_users')
        .select('email, user_id');

      if (!adminError && adminUsers) {
        const adminEmails = adminUsers.map(a => a.email.toLowerCase());
        const adminIds = adminUsers.filter(a => a.user_id).map(a => a.user_id);
        setAdmins([...adminEmails, ...adminIds]);
      }

      // Map profiles to users with admin status
      const usersData = profiles?.map(profile => ({
        ...profile,
        role: admins.includes(profile.id) || admins.includes(profile.email?.toLowerCase()) ? 'admin' : 'user'
      })) || [];

      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail) return;

    try {
      const { data, error } = await supabase.rpc('add_admin_user', {
        p_email: newAdminEmail
      });

      if (error) {
        alert(`Failed to add admin: ${error.message}`);
      } else {
        alert('Admin user added successfully!');
        setNewAdminEmail('');
        setAddingAdmin(false);
        fetchUsers();
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    if (!confirm(`Remove admin privileges from ${email}?`)) return;

    try {
      const { error } = await supabase.rpc('remove_admin_user', {
        p_email: email
      });

      if (error) {
        alert(`Failed to remove admin: ${error.message}`);
      } else {
        alert('Admin privileges removed successfully!');
        fetchUsers();
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) {
        alert(`Failed to update role: ${error.message}`);
      } else {
        setEditingUser(null);
        fetchUsers();
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to delete user ${email}? This action cannot be undone.`)) {
      return;
    }

    try {
      // Note: Deleting from auth.users requires service role key
      // For now, we'll just update the profile to mark as deleted
      const { error } = await supabase
        .from('profiles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        alert(`Failed to delete user: ${error.message}`);
      } else {
        alert('User marked as deleted successfully!');
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

    const matchesFilter = filter === 'all' ||
      (filter === 'admin' && user.role === 'admin') ||
      (filter === 'user' && user.role !== 'admin');

    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    regularUsers: users.filter(u => u.role !== 'admin').length,
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
          User Management
        </h1>
        <p className="text-gray-400">Manage users and admin privileges</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Users</div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Admins</div>
          <div className="text-2xl font-bold text-red-400">{stats.admins}</div>
        </div>
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-lg border border-gray-800 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Regular Users</div>
          <div className="text-2xl font-bold text-blue-400">{stats.regularUsers}</div>
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
          <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1">
            {(['all', 'admin', 'user'] as const).map((filterOption) => (
              <button
                key={filterOption}
                onClick={() => setFilter(filterOption)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  filter === filterOption
                    ? 'bg-orange-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                {filterOption === 'all' ? 'All Users' : filterOption === 'admin' ? 'Admins' : 'Users'}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAddingAdmin(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Add Admin
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

      {/* Add Admin Modal */}
      {addingAdmin && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-4">
            <input
              type="email"
              placeholder="Enter email address to grant admin privileges"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-red-500 focus:outline-none"
            />
            <button
              onClick={handleAddAdmin}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setAddingAdmin(false);
                setNewAdminEmail('');
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition"
            >
              <X className="w-4 h-4" />
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
                  Role
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
                      {editingUser === user.id ? (
                        <select
                          value={user.role || 'user'}
                          onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                          onBlur={() => setEditingUser(null)}
                          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.role === 'admin'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}>
                          {user.role === 'admin' && <Shield className="w-3 h-3" />}
                          {user.role || 'user'}
                        </span>
                      )}
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
                      <div className="flex items-center gap-2">
                        {user.role === 'admin' ? (
                          <button
                            onClick={() => handleRemoveAdmin(user.email)}
                            className="p-1.5 hover:bg-red-500/20 rounded-lg transition"
                            title="Remove Admin"
                          >
                            <UserX className="w-4 h-4 text-red-400" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAddAdmin()}
                            className="p-1.5 hover:bg-green-500/20 rounded-lg transition"
                            title="Make Admin"
                          >
                            <UserCheck className="w-4 h-4 text-green-400" />
                          </button>
                        )}
                        <button
                          onClick={() => setEditingUser(user.id)}
                          className="p-1.5 hover:bg-gray-700 rounded-lg transition"
                          title="Edit Role"
                        >
                          <Edit className="w-4 h-4 text-gray-400" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.email)}
                          className="p-1.5 hover:bg-red-500/20 rounded-lg transition"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}