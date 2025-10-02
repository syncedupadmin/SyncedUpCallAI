'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { Settings, Save, Copy, Building2, Hash, User, AlertCircle } from 'lucide-react'

interface AgencySettingsProps {
  agencyId: string
  initialName: string
}

const updateAgencySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Agency name must be at least 2 characters')
    .max(60, 'Agency name must not exceed 60 characters'),
  product_type: z.enum(['full', 'compliance_only']),
})

type UpdateAgencyInput = z.infer<typeof updateAgencySchema>

export function AgencySettings({ agencyId, initialName }: AgencySettingsProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [agencyData, setAgencyData] = useState({
    name: initialName,
    slug: '',
    id: agencyId,
    product_type: 'full' as 'full' | 'compliance_only',
  })

  const supabase = createClient()

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<UpdateAgencyInput>({
    resolver: zodResolver(updateAgencySchema),
    defaultValues: {
      name: initialName,
    },
  })

  // Load additional agency data
  useEffect(() => {
    const loadAgencyData = async () => {
      const { data } = await supabase
        .from('agencies')
        .select('slug, product_type')
        .eq('id', agencyId)
        .single()

      if (data) {
        setAgencyData(prev => ({
          ...prev,
          slug: data.slug || '',
          product_type: (data.product_type || 'full') as 'full' | 'compliance_only'
        }))
        reset({
          name: initialName,
          product_type: (data.product_type || 'full') as 'full' | 'compliance_only'
        })
      }
    }
    loadAgencyData()
  }, [agencyId, supabase, initialName, reset])

  const onSubmit = async (data: UpdateAgencyInput) => {
    setIsUpdating(true)

    try {
      const { data: updatedAgency, error } = await supabase
        .from('agencies')
        .update({
          name: data.name,
          product_type: data.product_type
        })
        .eq('id', agencyId)
        .select()
        .single()

      if (error) {
        if (error.code === '42501' || error.code === '403') {
          toast.error("You don't have permission to update this agency")
        } else {
          toast.error(error.message || 'Failed to update agency')
        }
        return
      }

      if (updatedAgency) {
        setAgencyData(prev => ({
          ...prev,
          name: data.name,
          product_type: data.product_type
        }))
        toast.success('Agency settings updated successfully')
        reset({
          name: data.name,
          product_type: data.product_type
        })

        // Update the page header if possible
        if (typeof window !== 'undefined') {
          const event = new CustomEvent('agency-updated', { detail: { name: data.name } })
          window.dispatchEvent(event)
        }
      }
    } catch (error) {
      console.error('Error updating agency:', error)
      toast.error('Failed to update agency')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleCopyId = () => {
    navigator.clipboard.writeText(agencyId)
    toast.success('Agency ID copied to clipboard')
  }

  const handleCopySlug = () => {
    navigator.clipboard.writeText(agencyData.slug)
    toast.success('Slug copied to clipboard')
  }

  return (
    <div className="space-y-6">
      {/* Agency Name Form */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5" />
          General Settings
        </h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Agency Name
            </label>
            <input
              id="name"
              {...register('name')}
              disabled={isUpdating}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
            {errors.name && (
              <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="product_type" className="block text-sm font-medium mb-1">
              Product Type
            </label>
            <select
              id="product_type"
              {...register('product_type')}
              disabled={isUpdating}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="full">Full Platform (All Features)</option>
              <option value="compliance_only">Compliance Only (Post-Close Analysis Only)</option>
            </select>
            {errors.product_type && (
              <p className="text-sm text-red-500 mt-1">{errors.product_type.message}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Full: Access to all features. Compliance Only: Only post-close verification (~80% cost savings)
            </p>
          </div>

          <button
            type="submit"
            disabled={isUpdating || !isDirty}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {isUpdating ? 'Updating...' : 'Update Settings'}
          </button>
        </form>
      </div>

      {/* Read-only Information */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Hash className="h-5 w-5" />
          Agency Identifiers
        </h3>

        <div className="space-y-4">
          {/* Slug */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-400">
              Slug (URL-friendly identifier)
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg font-mono text-sm">
                {agencyData.slug || '—'}
              </div>
              <button
                onClick={handleCopySlug}
                disabled={!agencyData.slug}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Copy slug"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Auto-generated from the agency name. Cannot be changed.
            </p>
          </div>

          {/* Agency ID */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-400">
              Agency ID
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg font-mono text-xs">
                {agencyId}
              </div>
              <button
                onClick={handleCopyId}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                title="Copy ID"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Unique identifier for this agency.
            </p>
          </div>
        </div>
      </div>

      {/* Transfer Ownership Placeholder */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <User className="h-5 w-5" />
          Ownership Transfer
        </h3>

        <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm text-yellow-200">
                Transfer ownership feature coming soon
              </p>
              <p className="text-xs text-gray-400">
                In a future update, you'll be able to transfer ownership of this agency to another admin.
                The new owner will have full control over the agency settings and members.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}