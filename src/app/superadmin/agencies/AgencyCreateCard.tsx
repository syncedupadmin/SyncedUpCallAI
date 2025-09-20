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
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAgencyInput>({
    resolver: zodResolver(createAgencySchema),
  })

  const onSubmit = async (data: CreateAgencyInput) => {
    setIsSubmitting(true)

    try {
      const { data: agency, error } = await supabase
        .rpc('create_agency_with_owner', { p_name: data.name })
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
        onAgencyCreated(newAgency)
        toast.success(`Successfully created ${newAgency.name}`)
        reset()
      }
    } catch (error) {
      console.error('Error creating agency:', error)
      toast.error('An unexpected error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
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
      </div>
    </div>
  )
}