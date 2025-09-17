'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { format } from 'date-fns';
import {
  Building2,
  Plus,
  Users,
  Calendar,
  Edit2,
  Trash2,
  Save,
  X,
  RefreshCw,
  Shield
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Office {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  user_count?: number;
}

export default function AgenciesPage() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddOffice, setShowAddOffice] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newOfficeName, setNewOfficeName] = useState('');
  const supabase = createClient();

  useEffect(() => {
    fetchOffices();
  }, []);

  const fetchOffices = async () => {
    try {
      setLoading(true);

      // Fetch offices
      const { data: officesData, error: officesError } = await supabase
        .from('offices')
        .select('*')
        .order('created_at', { ascending: false });

      if (officesError) throw officesError;

      // Fetch user counts for each office
      const officesWithCounts = await Promise.all(
        (officesData || []).map(async (office) => {
          const { count } = await supabase
            .from('user_offices')
            .select('*', { count: 'exact', head: true })
            .eq('office_id', office.id);

          return {
            ...office,
            user_count: count || 0
          };
        })
      );

      setOffices(officesWithCounts);
    } catch (error: any) {
      console.error('Error fetching offices:', error);
      toast.error('Failed to load agencies');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOffice = async () => {
    if (!newOfficeName.trim()) {
      toast.error('Agency name is required');
      return;
    }

    try {
      // Check if office already exists
      const { data: existing } = await supabase
        .from('offices')
        .select('id')
        .eq('name', newOfficeName.trim())
        .single();

      if (existing) {
        toast.error('An agency with this name already exists');
        return;
      }

      // Create new office
      const { data, error } = await supabase
        .from('offices')
        .insert({
          name: newOfficeName.trim(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Agency created successfully');
      setOffices([{ ...data, user_count: 0 }, ...offices]);
      setNewOfficeName('');
      setShowAddOffice(false);
    } catch (error: any) {
      console.error('Error creating office:', error);
      toast.error(error.message || 'Failed to create agency');
    }
  };

  const handleUpdateOffice = async (id: string) => {
    if (!editingName.trim()) {
      toast.error('Agency name is required');
      return;
    }

    try {
      const { error } = await supabase
        .from('offices')
        .update({
          name: editingName.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      toast.success('Agency updated successfully');
      setOffices(offices.map(o =>
        o.id === id ? { ...o, name: editingName.trim() } : o
      ));
      setEditingId(null);
      setEditingName('');
    } catch (error: any) {
      console.error('Error updating office:', error);
      toast.error('Failed to update agency');
    }
  };

  const handleDeleteOffice = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Check if office has users
      const { count } = await supabase
        .from('user_offices')
        .select('*', { count: 'exact', head: true })
        .eq('office_id', id);

      if (count && count > 0) {
        toast.error('Cannot delete agency with active users. Please reassign users first.');
        return;
      }

      const { error } = await supabase
        .from('offices')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Agency deleted successfully');
      setOffices(offices.filter(o => o.id !== id));
    } catch (error: any) {
      console.error('Error deleting office:', error);
      toast.error('Failed to delete agency');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            Agency Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage agencies and their settings
          </p>
        </div>
        <button
          onClick={() => setShowAddOffice(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Agency
        </button>
      </div>

      {/* Add New Agency Form */}
      {showAddOffice && (
        <div className="bg-gray-900 rounded-lg p-6 mb-6 border border-gray-800">
          <h2 className="text-lg font-semibold mb-4">Create New Agency</h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={newOfficeName}
              onChange={(e) => setNewOfficeName(e.target.value)}
              placeholder="Enter agency name"
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateOffice()}
              autoFocus
            />
            <button
              onClick={handleCreateOffice}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Create
            </button>
            <button
              onClick={() => {
                setShowAddOffice(false);
                setNewOfficeName('');
              }}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Agencies List */}
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Agency Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Users
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Updated
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {offices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No agencies found. Create your first agency to get started.
                </td>
              </tr>
            ) : (
              offices.map((office) => (
                <tr key={office.id} className="hover:bg-gray-800/50">
                  <td className="px-6 py-4">
                    {editingId === office.id ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="px-2 py-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                        onKeyPress={(e) => e.key === 'Enter' && handleUpdateOffice(office.id)}
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{office.name}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>{office.user_count || 0}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {format(new Date(office.created_at), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">
                    {format(new Date(office.updated_at), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {editingId === office.id ? (
                        <>
                          <button
                            onClick={() => handleUpdateOffice(office.id)}
                            className="p-1 text-green-500 hover:bg-gray-800 rounded"
                            title="Save"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditingName('');
                            }}
                            className="p-1 text-gray-500 hover:bg-gray-800 rounded"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(office.id);
                              setEditingName(office.name);
                            }}
                            className="p-1 text-blue-500 hover:bg-gray-800 rounded"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteOffice(office.id, office.name)}
                            className="p-1 text-red-500 hover:bg-gray-800 rounded"
                            title="Delete"
                            disabled={office.user_count && office.user_count > 0}
                          >
                            <Trash2 className={`w-4 h-4 ${office.user_count && office.user_count > 0 ? 'opacity-50' : ''}`} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Info Box */}
      <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4 mt-6">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Agency Management Info
        </h3>
        <ul className="text-sm space-y-1 text-gray-300">
          <li>• Agencies are organizational units that group users and calls</li>
          <li>• Each agency can have multiple users assigned to it</li>
          <li>• Users can belong to one or more agencies</li>
          <li>• Agencies with active users cannot be deleted</li>
        </ul>
      </div>
    </div>
  );
}