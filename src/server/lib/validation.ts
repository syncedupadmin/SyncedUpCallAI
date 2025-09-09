import { z } from 'zod';
export const ConvosoV1 = z.object({
  version: z.string().optional(),
  lead_id: z.string(),
  call_id: z.string().optional(),
  agent_id: z.string().optional(),
  agent_name: z.string().optional(),
  customer_phone: z.string(),
  disposition: z.string().optional(),
  campaign: z.string().optional(),
  direction: z.enum(['outbound','inbound']).optional(),
  started_at: z.string().optional(),
  ended_at: z.string().optional(),
  recording_url: z.string().url().optional(),
  sale_time: z.string().optional().nullable()
});
export type ConvosoV1 = z.infer<typeof ConvosoV1>;
