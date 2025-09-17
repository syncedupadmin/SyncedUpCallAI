import { createClient } from '@supabase/supabase-js';

const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;
const CONVOSO_API_BASE = 'https://api.convoso.com/v1';

export interface ConvosoCall {
  call_id: string;
  lead_id: string;
  agent_name: string;
  agent_id: string;
  disposition: string;
  duration: string;
  call_start: string;
  call_end: string;
  first_name?: string;
  last_name?: string;
  phone_number: string;
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
      // 1. Get last sync timestamp
      const { data: syncState } = await this.supabase
        .from('sync_state')
        .select('value')
        .eq('key', 'last_convoso_check')
        .eq('office_id', officeId)
        .single();

      const lastCheck = syncState?.value ||
        new Date(Date.now() - 3600000).toISOString(); // Default: 1 hour ago

      console.log(`[Convoso Sync] Fetching calls since: ${lastCheck}`);

      // 2. Fetch from Convoso API
      const params = new URLSearchParams({
        auth_token: CONVOSO_AUTH_TOKEN!,
        start_date: lastCheck,
        limit: '500'
      });

      const url = `${CONVOSO_API_BASE}/calllog/search?${params.toString()}`;
      console.log(`[Convoso Sync] Calling API: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Convoso Sync] API error: ${response.status} - ${errorText}`);
        throw new Error(`Convoso API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.success || !data.data?.entries) {
        console.log('[Convoso Sync] No new calls found');
        return { success: true, count: 0 };
      }

      // 3. Process each call
      const calls = data.data.entries as ConvosoCall[];
      let processedCount = 0;
      let newCallTime = lastCheck;

      for (const call of calls) {
        try {
          // Prepare call data with corrected column names
          const callData = {
            call_id: call.call_id,
            convoso_lead_id: call.lead_id, // Map to convoso_lead_id column
            agent_name: call.agent_name || call.agent_id,
            agent_email: null, // Set if available
            disposition: call.disposition,
            duration: parseInt(call.duration || '0'),
            phone_number: call.phone_number,
            recording_url: call.recording_url,
            campaign: call.campaign,
            started_at: call.call_start,
            ended_at: call.call_end,
            office_id: officeId, // REQUIRED field - using parameter
            talk_time_sec: parseInt(call.talk_time || '0'),
            source: 'convoso_api',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          // Insert or update call
          const { error: callError } = await this.supabase
            .from('calls')
            .upsert(callData, {
              onConflict: 'call_id',
              ignoreDuplicates: false
            });

          if (callError) {
            console.error(`Error saving call ${call.call_id}:`, callError);
            continue;
          }

          // Update or create contact if we have name/email
          if (call.first_name || call.last_name || call.email) {
            const contactData = {
              phone_number: call.phone_number,
              first_name: call.first_name,
              last_name: call.last_name,
              email: call.email,
              lead_id: call.lead_id,
              office_id: officeId,
              updated_at: new Date().toISOString()
            };

            await this.supabase
              .from('contacts')
              .upsert(contactData, {
                onConflict: 'phone_number',
                ignoreDuplicates: false
              });
          }

          processedCount++;

          // Track latest call time
          if (call.call_end > newCallTime) {
            newCallTime = call.call_end;
          }
        } catch (error) {
          console.error(`Error processing call ${call.call_id}:`, error);
        }
      }

      // 4. Update sync state with latest call time
      await this.supabase
        .from('sync_state')
        .upsert({
          key: 'last_convoso_check',
          value: newCallTime,
          office_id: officeId,
          updated_at: new Date().toISOString()
        });

      console.log(`[Convoso Sync] Processed ${processedCount} calls`);

      return {
        success: true,
        count: processedCount,
        lastCheck: newCallTime
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