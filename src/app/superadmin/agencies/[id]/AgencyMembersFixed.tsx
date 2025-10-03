'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { UserPlus, Trash2, RefreshCw, Users, Mail, Shield, Calendar, CheckCircle, X, Send, Key } from 'lucide-react'

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
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState({ email: '', name: '', isInvite: false })
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null)
  const [resetPasswordEmail, setResetPasswordEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)

  // Form state
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'agent'>('agent')

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
      const hasName = name && name.trim().length > 0

      if (hasName) {
        console.log('Creating new user with invite...')
        // Use the new API route to invite and add user
        const res = await fetch('/api/superadmin/invite-and-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.toLowerCase(),
            name,
            agencyId,
            role
          })
        })

        const json = await res.json()
        console.log('Full invite response:', {
          status: res.status,
          ok: res.ok,
          json
        })

        if (!res.ok || !json.ok) {
          console.error('Failed to invite user - Full details:', {
            status: res.status,
            response: json,
            error: json.error,
            details: json.details
          })

          // Show more detailed error
          const errorMessage = json.error || 'Failed to add user. Check console for details.'
          toast.error(errorMessage)
          return
        }

        // Success! Show appropriate message
        console.log('Success! User added, isNewUser:', json.isNewUser)

        if (json.isNewUser) {
          // New user - show invitation success modal
          setSuccessMessage({
            email: email.toLowerCase(),
            name: name || email.split('@')[0],
            isInvite: true
          })
          setShowSuccessModal(true)
          toast.success('Invitation sent! The user will receive an email to set up their account.')
        } else {
          // Existing user - just show toast
          toast.success('Existing user added to agency successfully!')
        }

        console.log('Modal state set:', { showSuccessModal: json.isNewUser })
      } else {
        // Add existing user by email lookup using RPC only
        const { data, error } = await supabase
          .rpc('add_user_to_agency_by_email', {
            p_agency: agencyId,
            p_email: email.toLowerCase(),
            p_role: role || 'agent'
          })

        if (error) {
          console.error('Error adding existing user:', error)

          if (error.message?.includes('duplicate') || error.code === '23505') {
            toast.error('User is already a member of this agency')
          } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
            toast.error('User not found. Check the email or create a new user.')
          } else {
            toast.error(error.message || 'Failed to add member')
          }
          return
        }

        // Show success modal for adding existing user
        setSuccessMessage({
          email: email.toLowerCase(),
          name: email.split('@')[0],
          isInvite: false
        })
        setShowSuccessModal(true)
      }

      // Reset form
      setEmail('')
      setName('')
      setRole('agent')
      await loadMembers()
    } catch (error: any) {
      console.error('Error adding member:', error)
      toast.error('An unexpected error occurred')
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

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setResettingPassword(true)
    try {
      const response = await fetch('/api/admin/reset-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetPasswordEmail,
          password: newPassword
        })
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to reset password')
      }

      toast.success('Password reset successfully!')
      setShowPasswordDialog(false)
      setNewPassword('')
      setResetPasswordUserId(null)
      setResetPasswordEmail('')
    } catch (error: any) {
      console.error('Error resetting password:', error)
      toast.error(error.message || 'Failed to reset password')
    } finally {
      setResettingPassword(false)
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

          <form onSubmit={handleAddMember} className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  disabled={adding}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex-1">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name (optional)"
                  disabled={adding}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'agent')}
                disabled={adding}
                className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="agent">Agent</option>
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
            </div>
          </form>
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
                          member.role === 'owner'
                            ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700'
                            : member.role === 'admin'
                            ? 'bg-purple-900/50 text-purple-300 border border-purple-700'
                            : 'bg-gray-800 text-gray-300'
                        } flex items-center gap-1 w-fit`}>
                          {(member.role === 'admin' || member.role === 'owner') && <Shield className="h-3 w-3" />}
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
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setResetPasswordUserId(member.user_id)
                              setResetPasswordEmail(member.email || '')
                              setShowPasswordDialog(true)
                            }}
                            className="p-1 text-blue-500 hover:bg-gray-800 rounded transition-colors"
                            title="Reset password"
                          >
                            <Key className="h-4 w-4" />
                          </button>
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

      {/* Password Reset Dialog */}
      {showPasswordDialog && resetPasswordUserId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Key className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Reset Password</h3>
                <p className="text-sm text-gray-400">{resetPasswordEmail}</p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                New Password
              </label>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 chars)"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                minLength={6}
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                User will need to sign in again with this new password
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowPasswordDialog(false)
                  setNewPassword('')
                  setResetPasswordUserId(null)
                  setResetPasswordEmail('')
                }}
                disabled={resettingPassword}
                className="px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resettingPassword || !newPassword || newPassword.length < 6}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {resettingPassword && <RefreshCw className="h-4 w-4 animate-spin" />}
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-gray-900 rounded-xl p-8 max-w-md w-full mx-4 border border-gray-800 shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Success Icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-green-500 rounded-full blur-xl opacity-30 animate-pulse"></div>
                <div className="relative bg-green-500/20 p-4 rounded-full border-2 border-green-500">
                  {successMessage.isInvite ? (
                    <Send className="h-8 w-8 text-green-400" />
                  ) : (
                    <CheckCircle className="h-8 w-8 text-green-400" />
                  )}
                </div>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-2xl font-bold text-center mb-4 text-white">
              {successMessage.isInvite ? 'Invitation Sent! 🎉' : 'Member Added! ✅'}
            </h3>

            {/* Message */}
            <div className="space-y-4 mb-6">
              {successMessage.isInvite ? (
                <>
                  <p className="text-gray-300 text-center">
                    An invitation email has been sent to:
                  </p>
                  <div className="bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <div>
                        <div className="font-medium text-white">{successMessage.email}</div>
                        {successMessage.name && successMessage.name !== successMessage.email.split('@')[0] && (
                          <div className="text-sm text-gray-400">{successMessage.name}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-sm text-blue-300">
                      <strong className="text-blue-400">What happens next:</strong>
                    </p>
                    <ul className="text-sm text-gray-300 mt-2 space-y-1 ml-4">
                      <li>• They'll receive an email invitation</li>
                      <li>• They'll click the link to set up their account</li>
                      <li>• They'll automatically be added to this agency</li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-300 text-center">
                    Successfully added to the agency:
                  </p>
                  <div className="bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-700">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <div className="font-medium text-white">{successMessage.email}</div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 text-center">
                    They can now access agency resources and data.
                  </p>
                </>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={() => {
                setShowSuccessModal(false)
                setSuccessMessage({ email: '', name: '', isInvite: false })
              }}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-lg transition-all duration-200 transform hover:scale-[1.02]"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  )
}