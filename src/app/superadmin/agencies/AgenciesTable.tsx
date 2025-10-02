'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Agency } from './types'
import toast from 'react-hot-toast'
import { Copy, MoreVertical, RefreshCw, Search, ChevronLeft, ChevronRight, Trash2, Settings } from 'lucide-react'
import Link from 'next/link'

interface AgenciesTableProps {
  initialData: Agency[]
  initialCount: number
}

const PAGE_SIZE = 25

export function AgenciesTable({ initialData, initialCount }: AgenciesTableProps) {
  const [agencies, setAgencies] = useState<Agency[]>(initialData)
  const [totalCount, setTotalCount] = useState(initialCount)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [deleteAgencyId, setDeleteAgencyId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingProductTypeId, setEditingProductTypeId] = useState<string | null>(null)
  const [editingProductTypeValue, setEditingProductTypeValue] = useState<'full' | 'compliance_only'>('full')
  const [isSavingProductType, setIsSavingProductType] = useState(false)
  const supabase = createClient()

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const filteredAgencies = useMemo(() => {
    if (!searchTerm) return agencies
    const term = searchTerm.toLowerCase()
    return agencies.filter(
      (agency) =>
        agency.name.toLowerCase().includes(term) ||
        (agency.slug && agency.slug.toLowerCase().includes(term))
    )
  }, [agencies, searchTerm])

  const fetchAgencies = async (page: number = 1) => {
    setIsLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    try {
      const { data, error, count } = await supabase
        .from('agencies')
        .select('id, name, slug, owner_user_id, created_at, updated_at, discovery_status, product_type', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) {
        toast.error(error.message)
        return
      }

      if (data) {
        setAgencies(data as Agency[])
        if (count !== null) {
          setTotalCount(count)
        }
      }
    } catch (error) {
      console.error('Error fetching agencies:', error)
      toast.error('Failed to fetch agencies')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    fetchAgencies(page)
  }

  const handleRefresh = () => {
    fetchAgencies(currentPage)
  }

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id)
    toast.success('Agency ID copied to clipboard')
  }

  const handleDelete = async (id: string) => {
    try {
      // Use the new RPC function for safer deletion
      const { data, error } = await supabase.rpc('delete_agency_with_confirmation', {
        p_agency_id: id,
        p_confirm_name: null // Not requiring name confirmation in UI for now
      })

      if (error) {
        console.error('Delete error:', error)
        if (error.code === '42501' || error.code === '403') {
          toast.error('You do not have permission to delete this agency')
        } else {
          toast.error(error.message || 'Failed to delete agency')
        }
        return
      }

      if (data && !data.success) {
        toast.error(data.error || 'Failed to delete agency')
        return
      }

      // Update local state
      setAgencies((prev) => prev.filter((agency) => agency.id !== id))
      setTotalCount((prev) => prev - 1)

      // Show success with details if available
      if (data?.deleted) {
        const { agency_name, members_removed, calls_removed } = data.deleted
        toast.success(`Successfully deleted ${agency_name}. Removed ${members_removed} members and ${calls_removed} calls.`)
      } else {
        toast.success('The agency has been successfully deleted')
      }
    } catch (error) {
      console.error('Error deleting agency:', error)
      toast.error('Failed to delete agency')
    } finally {
      setDeleteAgencyId(null)
      setShowDeleteDialog(false)
    }
  }

  const handleResetDiscovery = async (agencyId: string) => {
    if (!confirm('Reset discovery status for this agency? This will allow them to run discovery again.')) {
      return
    }

    try {
      const res = await fetch('/api/superadmin/discovery/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency_id: agencyId })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Reset failed')
      }

      toast.success('Discovery status reset - agency can now run discovery again')
      handleRefresh() // Refresh the table to show updated status
    } catch (error: any) {
      console.error('Error resetting discovery:', error)
      toast.error(error.message || 'Failed to reset discovery status')
    }
  }

  const handleProductTypeClick = (agencyId: string, currentType: 'full' | 'compliance_only') => {
    setEditingProductTypeId(agencyId)
    setEditingProductTypeValue(currentType)
  }

  const handleProductTypeSave = async (agencyId: string) => {
    setIsSavingProductType(true)

    try {
      // Try the RPC function first
      const { data: rpcData, error: rpcError } = await supabase.rpc('update_agency_product_type', {
        p_agency_id: agencyId,
        p_product_type: editingProductTypeValue
      })

      if (rpcError) {
        // If RPC doesn't exist or fails, try direct update
        console.log('RPC failed, trying direct update...', rpcError)

        // Check if user is super admin
        const { data: isSuperAdmin } = await supabase.rpc('is_super_admin')

        if (!isSuperAdmin) {
          toast.error('Only super admins can update product type')
          return
        }

        // Direct update as fallback
        const { error: updateError } = await supabase
          .from('agencies')
          .update({
            product_type: editingProductTypeValue,
            updated_at: new Date().toISOString()
          })
          .eq('id', agencyId)

        if (updateError) {
          toast.error(updateError.message || 'Failed to update product type')
          return
        }
      } else if (rpcData && !rpcData.success) {
        toast.error(rpcData.error || 'Failed to update product type')
        return
      }

      // Update local state
      setAgencies((prev) =>
        prev.map(agency =>
          agency.id === agencyId
            ? { ...agency, product_type: editingProductTypeValue }
            : agency
        )
      )

      toast.success(`Product type updated to ${editingProductTypeValue === 'full' ? 'Full Platform' : 'Compliance Only'}`)
      setEditingProductTypeId(null)
    } catch (error) {
      console.error('Error updating product type:', error)
      toast.error('Failed to update product type')
    } finally {
      setIsSavingProductType(false)
    }
  }

  const handleProductTypeCancel = () => {
    setEditingProductTypeId(null)
    setEditingProductTypeValue('full')
  }

  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date))
  }

  const formatShortId = (id: string | null) => {
    if (!id) return '—'
    return id.slice(0, 8)
  }

  useEffect(() => {
    setAgencies(initialData)
    setTotalCount(initialCount)
  }, [initialData, initialCount])

  if (agencies.length === 0 && !searchTerm && !isLoading) {
    return (
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-12 text-center">
        <p className="text-gray-400 mb-4">No agencies yet—create your first one.</p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">Agencies</h2>
              <p className="text-sm text-gray-400 mt-1">Manage all agencies in the system</p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="Refresh agencies"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or slug..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Product Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Discovery
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredAgencies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    {searchTerm ? 'No agencies found matching your search' : 'No agencies available'}
                  </td>
                </tr>
              ) : (
                filteredAgencies.map((agency) => (
                  <tr key={agency.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4 font-medium">
                      <Link
                        href={`/superadmin/agencies/${agency.id}`}
                        className="hover:text-blue-400 transition-colors"
                      >
                        {agency.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      {agency.slug ? (
                        <span className="px-2 py-1 text-xs bg-gray-800 text-gray-300 rounded">
                          {agency.slug}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingProductTypeId === agency.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={editingProductTypeValue}
                            onChange={(e) => setEditingProductTypeValue(e.target.value as 'full' | 'compliance_only')}
                            disabled={isSavingProductType}
                            className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                          >
                            <option value="full">Full Platform</option>
                            <option value="compliance_only">Compliance Only</option>
                          </select>
                          <button
                            onClick={() => handleProductTypeSave(agency.id)}
                            disabled={isSavingProductType}
                            className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
                            title="Save"
                          >
                            ✓
                          </button>
                          <button
                            onClick={handleProductTypeCancel}
                            disabled={isSavingProductType}
                            className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded disabled:opacity-50"
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleProductTypeClick(agency.id, agency.product_type || 'full')}
                          className="group hover:opacity-80 transition-opacity"
                          title="Click to change product type"
                        >
                          {agency.product_type === 'compliance_only' ? (
                            <span className="px-2 py-1 text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded font-medium group-hover:border-cyan-400">
                              Compliance Only
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-medium group-hover:border-blue-300">
                              Full Platform
                            </span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-400">{formatShortId(agency.owner_user_id)}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {formatDate(agency.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      {agency.discovery_status === 'completed' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-green-400 text-sm">✅ Completed</span>
                          <button
                            onClick={() => handleResetDiscovery(agency.id)}
                            className="px-2 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors"
                            title="Reset discovery status - allows agency to run discovery again"
                          >
                            Reset
                          </button>
                        </div>
                      ) : agency.discovery_status === 'in_progress' ? (
                        <span className="text-blue-400 text-sm">⏱️ In Progress</span>
                      ) : (
                        <span className="text-gray-500 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-gray-400">{agency.id.slice(0, 8)}...</code>
                        <button
                          onClick={() => handleCopyId(agency.id)}
                          className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                          aria-label={`Copy ID for ${agency.name}`}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/superadmin/agencies/${agency.id}`}
                          className="p-1 text-blue-500 hover:bg-gray-800 rounded transition-colors"
                          title="Manage agency"
                        >
                          <Settings className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => {
                            setDeleteAgencyId(agency.id)
                            setShowDeleteDialog(true)
                          }}
                          className="p-1 text-red-500 hover:bg-gray-800 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && !searchTerm && (
          <div className="flex items-center justify-between p-4 border-t border-gray-800">
            <div className="text-sm text-gray-400">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
                className="px-3 py-1 text-sm bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || isLoading}
                className="px-3 py-1 text-sm bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && deleteAgencyId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-800">
            <h3 className="text-lg font-bold mb-2">Are you sure?</h3>
            <p className="text-gray-400 mb-6">
              This action cannot be undone. This will permanently delete the agency from the system.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteDialog(false)
                  setDeleteAgencyId(null)
                }}
                className="px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteAgencyId && handleDelete(deleteAgencyId)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}