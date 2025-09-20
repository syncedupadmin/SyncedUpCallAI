'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { UserPlus, Trash2, RefreshCw, Users, Mail, Shield, Calendar } from 'lucide-react'

interface AgencyMembersProps {
  agencyId: string
}

interface Member {
  user_id: string
  role: string
  created_at: string
  email?: string
  name?: string
}

export function AgencyMembers({ agencyId }: AgencyMembersProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)

  // Form state
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')

  const supabase = createClient()

  useEffect(() => {
    loadMembers()
  }, [agencyId])

  const loadMembers = async () => {
    setLoading(true)
    try {
      // Fetch user_agencies records
      const { data: memberData, error: membersError } = await supabase
        .from('user_agencies')
        .select('user_id, role, created_at')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })

      if (membersError) {
        if (membersError.code === '42501' || membersError.code === '403') {
          toast.error("You don't have permission to manage this agency.")
        } else {
          toast.error('Failed to load members')
        }
        console.error('Error loading members:', membersError)
        return
      }

      if (!memberData || memberData.length === 0) {
        setMembers([])
        return
      }

      // Get unique user IDs
      const userIds = memberData.map(m => m.user_id)

      // Fetch from profiles table (we know it exists with id, email, name columns)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, name')
        .in('id', userIds)

      // Map profiles by ID for quick lookup
      const profilesMap = new Map()
      if (!profilesError && profiles) {
        profiles.forEach(p => profilesMap.set(p.id, p))
      }

      // Combine member data with profile data
      const enrichedMembers = memberData.map(member => ({
        ...member,
        email: profilesMap.get(member.user_id)?.email,
        name: profilesMap.get(member.user_id)?.name,
      }))

      setMembers(enrichedMembers)
    } catch (error) {
      console.error('Error loading members:', error)
      toast.error('Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Please enter an email address')
      return
    }

    setAdding(true)
    try {
      // Use the new RPC that handles email lookup and adding in one call
      const { data, error } = await supabase
        .rpc('add_user_to_agency_by_email', {
          p_agency: agencyId,
          p_email: email.toLowerCase(),
          p_role: role
        })

      if (error) {
        toast.error(error.message || 'Failed to add member')
        return
      }

      if (data && !data.success) {
        toast.error(data.error || 'Failed to add member')
        return
      }

      toast.success(`Successfully added ${email} to the agency`)
      setEmail('')
      setRole('member')
      await loadMembers()
    } catch (error: any) {
      console.error('Error adding member:', error)
      if (error.message?.includes('duplicate key')) {
        toast.error('User is already a member of this agency')
      } else {
        toast.error('Failed to add member')
      }
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    setRemoving(userId)
    try {
      const { error } = await supabase
        .rpc('remove_user_from_agency', {
          p_agency: agencyId,
          p_user: userId
        })

      if (error) {
        if (error.message?.includes('owner')) {
          toast.error("Cannot remove the agency owner")
        } else if (error.code === '42501' || error.code === '403' || error.message?.includes('permission')) {
          toast.error("You don't have permission to remove members")
        } else {
          toast.error(error.message || 'Failed to remove member')
        }
        return
      }

      toast.success('Member removed successfully')
      setMembers(members.filter(m => m.user_id !== userId))
    } catch (error) {
      console.error('Error removing member:', error)
      toast.error('Failed to remove member')
    } finally {
      setRemoving(null)
      setShowDeleteDialog(false)
      setDeleteUserId(null)
    }
  }

  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date))
  }

  const formatShortId = (id: string) => {
    return id.slice(0, 8)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* Add Member Form */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Member
          </h3>
          <form onSubmit={handleAddMember} className="flex gap-3">
            <div className="flex-1">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter user email"
                disabled={adding}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
              disabled={adding}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {adding && <RefreshCw className="h-4 w-4 animate-spin" />}
              Add Member
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            Add users who already have an account by entering their email address.
          </p>
        </div>

        {/* Members Table */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" />
              Agency Members ({members.length})
            </h3>
          </div>

          {members.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              No members yet. Add members using the form above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800 border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {members.map((member) => (
                    <tr key={member.user_id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <div>
                            {member.email || member.name ? (
                              <>
                                <div className="font-medium">{member.name || member.email}</div>
                                {member.name && member.email && (
                                  <div className="text-sm text-gray-400">{member.email}</div>
                                )}
                              </>
                            ) : (
                              <code className="text-sm">{formatShortId(member.user_id)}</code>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded ${
                          member.role === 'admin'
                            ? 'bg-purple-900/50 text-purple-300 border border-purple-700'
                            : 'bg-gray-800 text-gray-300'
                        } flex items-center gap-1 w-fit`}>
                          {member.role === 'admin' && <Shield className="h-3 w-3" />}
                          {member.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(member.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => {
                              setDeleteUserId(member.user_id)
                              setShowDeleteDialog(true)
                            }}
                            disabled={removing === member.user_id}
                            className="p-1 text-red-500 hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                            title="Remove member"
                          >
                            {removing === member.user_id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && deleteUserId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-800">
            <h3 className="text-lg font-bold mb-2">Remove Member</h3>
            <p className="text-gray-400 mb-6">
              Are you sure you want to remove this member from the agency? They will lose access to agency resources.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteDialog(false)
                  setDeleteUserId(null)
                }}
                className="px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteUserId && handleRemoveMember(deleteUserId)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}