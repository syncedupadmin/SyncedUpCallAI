'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createAgencySchema, type CreateAgencyInput, type Agency } from './types'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

interface AgencyCreateCardProps {
  onAgencyCreated: (agency: Agency) => void
}

export function AgencyCreateCard({ onAgencyCreated }: AgencyCreateCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreatingTest, setIsCreatingTest] = useState(false)
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAgencyInput>({
    resolver: zodResolver(createAgencySchema),
    defaultValues: {
      name: '',
      product_type: 'full',
    },
  })

  const onSubmit = async (data: CreateAgencyInput) => {
    setIsSubmitting(true)

    // Debug logging
    console.log('Creating agency with data:', data)
    console.log('Product type being sent:', data.product_type)

    try {
      // TEMPORARY FIX: Direct insert instead of RPC
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id

      if (!userId) {
        toast.error('Not authenticated')
        return
      }

      // Generate unique slug
      const baseSlug = data.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const uniqueSlug = `${baseSlug}-${Date.now()}`

      const { data: agency, error } = await supabase
        .from('agencies')
        .insert({
          name: data.name,
          slug: uniqueSlug,
          owner_user_id: userId,
          product_type: data.product_type || 'full',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        // Show nicer duplicate message
        if ((error as any).code === '23505' || (error as any).status === 409) {
          toast.error('Name/slug already exists—try another name.')
        } else {
          toast.error(error.message || 'Failed to create agency.')
        }
        return
      }

      if (agency) {
        const newAgency = agency as Agency
        console.log('Agency created response:', agency)
        console.log('Product type in response:', newAgency.product_type)

        // Also add the owner to user_agencies
        await supabase
          .from('user_agencies')
          .insert({
            user_id: userId,
            agency_id: newAgency.id,
            role: 'owner',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        onAgencyCreated(newAgency)
        toast.success(`Successfully created ${newAgency.name} with product type: ${newAgency.product_type}`)
        reset({
          name: '',
          product_type: 'full',
        })
      }
    } catch (error) {
      console.error('Error creating agency:', error)
      toast.error('An unexpected error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const createTestAgency = async () => {
    setIsCreatingTest(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id

      if (!userId) {
        toast.error('Not authenticated')
        return
      }

      // Generate test agency name with timestamp
      const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, '')
      const testName = `Test Compliance ${timestamp}`
      const uniqueSlug = `test-compliance-${Date.now()}`

      // Create agency with compliance_only type
      const { data: agency, error: createError } = await supabase
        .from('agencies')
        .insert({
          name: testName,
          slug: uniqueSlug,
          owner_user_id: userId,
          product_type: 'compliance_only',
          discovery_status: 'skipped',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (createError) {
        toast.error(createError.message || 'Failed to create test agency.')
        return
      }

      if (agency) {
        const newAgency = agency as Agency

        // Add owner to user_agencies
        await supabase
          .from('user_agencies')
          .insert({
            user_id: userId,
            agency_id: newAgency.id,
            role: 'owner',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        // Update discovery status to skipped using admin API
        try {
          await fetch('/api/superadmin/discovery/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agency_id: newAgency.id,
              discovery_status: 'skipped'
            })
          })
        } catch (err) {
          console.log('Could not update discovery status, but agency created')
        }

        onAgencyCreated({ ...newAgency, discovery_status: 'skipped' })
        toast.success(`Test agency "${testName}" created with compliance-only access and discovery skipped!`)
      }
    } catch (error) {
      console.error('Error creating test agency:', error)
      toast.error('Failed to create test agency.')
    } finally {
      setIsCreatingTest(false)
    }
  }

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold">Create Agency</h2>
        <p className="text-sm text-gray-400 mt-1">
          Add a new agency to the system. A unique slug will be auto-generated from the name.
        </p>
      </div>
      <div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-medium mb-1">Agency name</label>
            <input
              id="name"
              placeholder="Enter agency name"
              disabled={isSubmitting}
              {...register('name')}
              aria-invalid={errors.name ? 'true' : 'false'}
              aria-describedby={errors.name ? 'name-error' : undefined}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
            {errors.name && (
              <p id="name-error" className="text-sm text-red-500">
                {errors.name.message}
              </p>
            )}
            <p className="text-sm text-gray-500">
              A unique slug will be generated automatically (e.g., "PHS" → "phs", "phs-2", "phs-3")
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="product_type" className="block text-sm font-medium mb-1">Product Type</label>
            <select
              id="product_type"
              disabled={isSubmitting}
              {...register('product_type')}
              aria-invalid={errors.product_type ? 'true' : 'false'}
              aria-describedby={errors.product_type ? 'product-type-error' : undefined}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="full">Full Platform (All Features)</option>
              <option value="compliance_only">Compliance Only (Post-Close Analysis Only)</option>
            </select>
            {errors.product_type && (
              <p id="product-type-error" className="text-sm text-red-500">
                {errors.product_type.message}
              </p>
            )}
            <p className="text-sm text-gray-500">
              Full: Access to all features. Compliance Only: Only post-close verification (~80% cost savings)
            </p>
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create agency'
            )}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-sm text-gray-400 mb-2">Quick Actions:</p>
          <button
            onClick={createTestAgency}
            disabled={isCreatingTest || isSubmitting}
            className="w-full px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            title="Creates a compliance-only agency with discovery skipped for testing"
          >
            {isCreatingTest ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Test Agency...
              </>
            ) : (
              '🧪 Create Test Compliance Agency'
            )}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Creates a compliance-only agency with discovery pre-skipped for immediate testing
          </p>
        </div>
      </div>
    </div>
  )
}