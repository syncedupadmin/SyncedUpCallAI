'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { Users, RefreshCw, Trash2, Calendar, Shield, AlertCircle } from 'lucide-react'

interface AgencyMembersProps {
  agencyId: string
}

interface Member {
  user_id: string
  role: string
  created_at: string
}

export function AgencyMembers({ agencyId }: AgencyMembersProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)

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

      setMembers(memberData || [])
    } catch (error) {
      console.error('Error loading members:', error)
      toast.error('Failed to load members')
    } finally {
      setLoading(false)
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
        if (error.code === '42501' || error.code === '403') {
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
        {/* Notice about adding members */}
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-yellow-200 font-semibold">
                Member Management Setup Required
              </p>
              <p className="text-xs text-gray-400">
                To enable adding members by email, you need to:
              </p>
              <ul className="text-xs text-gray-400 space-y-1 ml-4">
                <li>• Create a <code className="text-yellow-400">profiles</code> table with user emails</li>
                <li>• Or create an RPC function <code className="text-yellow-400">get_user_id_by_email</code></li>
                <li>• Or use the Supabase Dashboard to manually add members</li>
              </ul>
              <p className="text-xs text-gray-500 mt-2">
                Current members are shown below with their user IDs.
              </p>
            </div>
          </div>
        </div>

        {/* Members Table */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-5 w-5" />
                Agency Members ({members.length})
              </h3>
              <button
                onClick={loadMembers}
                className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {members.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              No members yet. Add members using the Supabase Dashboard or setup the profiles table.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800 border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      User ID
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
                        <code className="text-sm font-mono bg-gray-800 px-2 py-1 rounded">
                          {formatShortId(member.user_id)}...
                        </code>
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

        {/* How to add members */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h4 className="text-sm font-semibold mb-2">How to add members:</h4>
          <ol className="text-xs text-gray-400 space-y-1 ml-4">
            <li>1. Go to Supabase Dashboard → Table Editor → user_agencies</li>
            <li>2. Click "Insert row"</li>
            <li>3. Set <code className="text-blue-400">user_id</code> (from auth.users), <code className="text-blue-400">agency_id</code> (this agency), and <code className="text-blue-400">role</code> (member/admin)</li>
            <li>4. Save and refresh this page</li>
          </ol>
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