export type ConvosoCall = {
  id: string;             // Convoso's call ID (string)
  started_at: string;     // ISO
  ended_at?: string;      // ISO
  agent?: string;
  agent_id?: string;
  disposition?: string;
  duration_sec?: number;
  talk_time_sec?: number;
  wrap_time_sec?: number;
  recording_url?: string;
  lead_phone?: string;
  lead_id?: string;
  campaign?: string;
  direction?: string;
  queue?: string;
  language?: string;
  tags?: string[];
  raw?: unknown;          // full raw payload for audit
};

export type ConvosoCallPage = {
  data: ConvosoCall[];
  page: number;
  total_pages: number;
  total: number;
};

export type ConvosoAPIResponse = {
  success: boolean;
  data?: Array<{
    call_id: string;
    lead_id?: string;
    agent_id?: string;
    agent_name?: string;
    campaign_id?: string;
    campaign_name?: string;
    disposition?: string;
    phone_number?: string;
    start_time?: string;
    end_time?: string;
    duration?: number;
    talk_time?: number;
    wrap_time?: number;
    recording_url?: string;
    direction?: string;
    queue?: string;
    language?: string;
    tags?: string[];
  }>;
  total?: number;
  offset?: number;
  limit?: number;
  error?: string;
};

export type ConvosoSyncStatus = {
  sync_type: 'backfill' | 'realtime' | 'delta';
  started_at: Date;
  completed_at?: Date;
  from_date?: Date;
  to_date?: Date;
  records_processed: number;
  records_inserted: number;
  records_updated: number;
  records_failed: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
};