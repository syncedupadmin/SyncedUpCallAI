import { createClient } from '@supabase/supabase-js';

const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;
const CONVOSO_API_BASE = 'https://api.convoso.com/v1';

export interface ConvosoCall {
  // From /users/recordings endpoint
  recording_id?: number;
  lead_id: string | number;
  start_time?: string;
  end_time?: string;
  seconds?: number | null;
  url?: string;

  // Additional fields we might get
  call_id?: string;
  agent_name?: string;
  agent_id?: string;
  disposition?: string;
  duration?: string | number;
  call_start?: string;
  call_end?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  email?: string;
  campaign?: string;
  list_id?: string;
  recording_url?: string;
  talk_time?: string;
  wait_time?: string;
  wrap_time?: string;
}

export class ConvosoSyncService {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  async syncCalls(officeId: number = 1) {
    console.log(`[Convoso Sync] Starting sync for office ${officeId}`);

    try {
      // Get last sync date - format as YYYY-MM-DD
      const { data: syncState } = await this.supabase
        .from('sync_state')
        .select('value')
        .eq('key', 'last_convoso_check')
        .eq('office_id', officeId)
        .single();

      // Convert to YYYY-MM-DD format (Convoso requirement)
      const lastCheckDate = syncState?.value
        ? new Date(syncState.value).toISOString().split('T')[0]
        : new Date(Date.now() - 86400000).toISOString().split('T')[0]; // Yesterday

      console.log(`[Convoso Sync] Fetching recordings since: ${lastCheckDate}`);

      // Use the CORRECT endpoint: leads/get-recordings
      const params = new URLSearchParams({
        auth_token: CONVOSO_AUTH_TOKEN!,
        date_from: lastCheckDate,  // YYYY-MM-DD format
        date_to: new Date().toISOString().split('T')[0], // Today
        limit: '500'
      });

      const url = `${CONVOSO_API_BASE}/leads/get-recordings?${params.toString()}`;
      console.log(`[Convoso Sync] Calling API: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Convoso Sync] API error: ${response.status} - ${errorText}`);
        throw new Error(`Convoso API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // The response structure is different for get-recordings
      if (!data || !data.recordings) {
        console.log('[Convoso Sync] No recordings found');
        return { success: true, count: 0 };
      }

      console.log(`[Convoso Sync] Found ${data.recordings.length} recordings`);

      // 3. Process recordings (different field names!)
      const recordings = data.recordings;
      let processedCount = 0;
      let latestDate = lastCheckDate;

      for (const recording of recordings) {
        try {
          // Map recording data to our call structure
          const callData = {
            call_id: recording.id ? `convoso_${recording.id}` : `convoso_${recording.recording_id || Date.now()}_${Math.random()}`,
            convoso_lead_id: String(recording.lead_id),
            agent_name: recording.agent || recording.agent_name || 'Unknown Agent',
            agent_email: null,
            disposition: recording.disposition || 'UNKNOWN',
            duration: parseInt(recording.duration || '0'),
            phone_number: recording.phone || recording.phone_number || 'Unknown',
            recording_url: recording.url || recording.recording_url,
            campaign: recording.campaign || 'Unknown',
            started_at: recording.date || recording.created_at || new Date().toISOString(),
            ended_at: recording.end_date || recording.created_at || new Date().toISOString(),
            office_id: officeId,
            talk_time_sec: parseInt(recording.duration || '0'),
            source: 'convoso_api',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: {
              recording_id: recording.id || recording.recording_id,
              original_url: recording.url
            }
          };

          // Insert or update call
          const { error: callError } = await this.supabase
            .from('calls')
            .upsert(callData, {
              onConflict: 'call_id',
              ignoreDuplicates: false
            });

          if (callError) {
            console.error(`Error saving call:`, callError);
            continue;
          }

          processedCount++;

          // Track latest date
          const recordingDate = recording.date || recording.created_at;
          if (recordingDate && recordingDate > latestDate) {
            latestDate = recordingDate;
          }
        } catch (error) {
          console.error(`Error processing recording:`, error);
        }
      }

      // 4. Update sync state with current time
      await this.supabase
        .from('sync_state')
        .upsert({
          key: 'last_convoso_check',
          value: new Date().toISOString(),
          office_id: officeId,
          updated_at: new Date().toISOString()
        });

      console.log(`[Convoso Sync] Processed ${processedCount} recordings`);

      return {
        success: true,
        count: processedCount
      };

    } catch (error: any) {
      console.error('[Convoso Sync] Fatal error:', error);
      throw error;
    }
  }

  // Manual reset function for testing
  async resetSyncTime(officeId: number = 1, hoursAgo: number = 1) {
    const resetTime = new Date(Date.now() - (hoursAgo * 3600000)).toISOString();

    const { error } = await this.supabase
      .from('sync_state')
      .upsert({
        key: 'last_convoso_check',
        value: resetTime,
        office_id: officeId,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    return { success: true, resetTo: resetTime };
  }

  // Get current sync status
  async getSyncStatus(officeId: number = 1) {
    const { data, error } = await this.supabase
      .from('sync_state')
      .select('value, updated_at')
      .eq('key', 'last_convoso_check')
      .eq('office_id', officeId)
      .single();

    if (error && error.code !== 'PGRST116') { // Ignore not found error
      throw error;
    }

    return {
      lastSync: data?.value || null,
      updatedAt: data?.updated_at || null
    };
  }
}