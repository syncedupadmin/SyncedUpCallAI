import { z } from 'zod'

export const createAgencySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Agency name must be at least 2 characters')
    .max(60, 'Agency name must not exceed 60 characters')
    .refine((val) => val.length > 0, 'Agency name is required'),
})

export type CreateAgencyInput = z.infer<typeof createAgencySchema>

export interface Agency {
  id: string
  name: string
  slug: string | null
  owner_user_id: string | null
  created_at: string
  updated_at: string
}