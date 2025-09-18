import { createClient } from '@supabase/supabase-js';

const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;
const CONVOSO_API_BASE = 'https://api.convoso.com/v1';

// Cache for lead data to avoid duplicate API calls
const leadCache = new Map<string, any>();
const CACHE_TTL = 3600000; // 1 hour

export interface ConvosoRecording {
  recording_id: string;
  lead_id: string;
  start_time: string;
  end_time: string;
  seconds: string;
  url: string;
}

export interface ConvosoLead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  status: string;
  status_name: string;
  user_id: string;
  user_name: string;
  campaign_name: string;
  list_id: string;
  directory_name: string;
  last_called: string;
  created_at: string;
  modified_at: string;
}

export interface CombinedCallData {
  // Recording data
  recording_id: string;
  lead_id: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  recording_url: string;

  // Lead data
  customer_first_name: string;
  customer_last_name: string;
  customer_phone: string;
  customer_email: string;
  agent_id: string;
  agent_name: string;
  disposition: string;
  campaign_name: string;
  list_name: string;

  // Metadata
  imported_at?: string;
  imported_by?: string;
  source?: 'manual' | 'cron';
}

export interface ControlSettings {
  system_enabled: boolean;
  active_campaigns: string[];
  active_lists: string[];
  active_dispositions: string[];
  active_agents: string[];
}

export class ConvosoService {
  private supabase;
  private leadCacheTimestamps = new Map<string, number>();

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Fetch call logs with recordings from Convoso API using the /log/retrieve endpoint with pagination
   * This endpoint properly respects date parameters and includes all call metadata
   */
  async fetchRecordings(dateFrom: string, dateTo: string, maxLimit?: number): Promise<ConvosoRecording[]> {
    // Convert date format from YYYY-MM-DD to YYYY-MM-DD HH:MM:SS
    const formatDateTime = (date: string) => {
      if (date.includes(' ')) return date; // Already formatted
      if (date.includes(':')) return date; // Has time
      return `${date} 00:00:00`; // Add start of day
    };

    const formatEndDateTime = (date: string) => {
      if (date.includes(' ')) return date; // Already formatted
      if (date.includes(':')) return date; // Has time
      return `${date} 23:59:59`; // Add end of day
    };

    const allRecordings: ConvosoRecording[] = [];
    let offset = 0;
    const limit = 10000; // Convoso API max limit per request
    let totalFound = 0;
    let hasMore = true;

    console.log(`[ConvosoService] Fetching call logs from ${formatDateTime(dateFrom)} to ${formatEndDateTime(dateTo)}`);

    while (hasMore) {
      const params = new URLSearchParams({
        auth_token: CONVOSO_AUTH_TOKEN!,
        start_time: formatDateTime(dateFrom),
        end_time: formatEndDateTime(dateTo),
        include_recordings: '1',
        limit: String(limit),
        offset: String(offset)
      });

      const url = `${CONVOSO_API_BASE}/log/retrieve?${params.toString()}`;
      console.log(`[ConvosoService] Fetching recordings page: offset=${offset}, limit=${limit}`);

      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        // Check for API error
        if (data.success === false) {
          throw new Error(data.text || data.error || 'API returned failure');
        }

        // Extract and transform call logs to match our recording structure
        if (data.data && data.data.results) {
          totalFound = data.data.total_found || 0;
          const pageResults = data.data.results;

          console.log(`[ConvosoService] Page ${Math.floor(offset / limit) + 1}: Found ${totalFound} total calls, fetched ${pageResults.length} in this page`);

          // Transform log entries to match ConvosoRecording structure
          // NO FILTERS - let the UI handle filtering
          const recordings = pageResults
            .map((entry: any) => ({
              recording_id: entry.recording?.[0]?.recording_id || entry.id,
              lead_id: entry.lead_id,
              start_time: entry.call_date,
              end_time: entry.call_date, // Will calculate from duration
              seconds: entry.call_length,
              url: entry.recording?.[0]?.public_url || entry.recording?.[0]?.src || ''
            }));

          allRecordings.push(...recordings);

          // Check if we need to fetch more pages
          if (pageResults.length < limit || allRecordings.length >= totalFound) {
            hasMore = false;
          } else if (maxLimit && allRecordings.length >= maxLimit) {
            // Stop if we've reached the user-specified max limit
            hasMore = false;
            console.log(`[ConvosoService] Stopping at user-specified limit of ${maxLimit}`);
          } else {
            offset += limit;
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } else {
          hasMore = false;
        }
      } catch (error: any) {
        console.error(`[ConvosoService] Error fetching recordings at offset ${offset}:`, error);
        // If we've already fetched some data, return what we have
        if (allRecordings.length > 0) {
          console.warn(`[ConvosoService] Returning partial results: ${allRecordings.length} recordings fetched before error`);
          return allRecordings as ConvosoRecording[];
        }
        throw error;
      }
    }

    console.log(`[ConvosoService] Completed fetching ${allRecordings.length} recordings out of ${totalFound} total`);
    return allRecordings as ConvosoRecording[];
  }

  /**
   * Fetch recordings using the users/recordings endpoint (requires user email/ID)
   * This is the documented endpoint but requires specific user parameter
   */
  async fetchUserRecordings(userEmails: string[], startTime: string, endTime: string, limit: number = 20, offset: number = 0): Promise<ConvosoRecording[]> {
    // Format datetime: YYYY-MM-DD HH:MM:SS
    const formatDateTime = (date: string) => {
      if (date.includes(' ')) return date;
      return `${date} 00:00:00`;
    };

    const params = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN!,
      user: userEmails.join(','), // Comma-delimited list of users
      start_time: formatDateTime(startTime),
      end_time: formatDateTime(endTime),
      limit: String(limit),
      offset: String(offset)
    });

    const url = `${CONVOSO_API_BASE}/users/recordings?${params.toString()}`;
    console.log(`[ConvosoService] Fetching user recordings for users: ${userEmails.join(',')}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success === false) {
        throw new Error(data.text || data.error || 'API returned failure');
      }

      if (data.data && data.data.entries) {
        console.log(`[ConvosoService] Found ${data.data.total} user recordings, fetched ${data.data.entries.length}`);
        return data.data.entries as ConvosoRecording[];
      }

      return [];
    } catch (error: any) {
      console.error('[ConvosoService] Error fetching user recordings:', error);
      throw error;
    }
  }

  /**
   * Fetch lead data from Convoso API
   */
  async fetchLeadData(leadId: string): Promise<ConvosoLead | null> {
    // Check cache first
    const cached = this.getCachedLead(leadId);
    if (cached) {
      console.log(`[ConvosoService] Using cached lead data for ${leadId}`);
      return cached;
    }

    const formData = new URLSearchParams({
      auth_token: CONVOSO_AUTH_TOKEN!,
      lead_id: leadId,
      limit: '1'
    });

    const url = `${CONVOSO_API_BASE}/leads/search`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success === false) {
        console.warn(`[ConvosoService] Lead ${leadId} not found:`, data.text);
        return null;
      }

      if (data.data && data.data.entries && data.data.entries.length > 0) {
        const lead = data.data.entries[0];
        this.cacheLeadData(leadId, lead);
        return lead;
      }

      return null;
    } catch (error: any) {
      console.error(`[ConvosoService] Error fetching lead ${leadId}:`, error);
      return null;
    }
  }

  /**
   * Combine recording and lead data into complete call record
   */
  combineCallData(recording: ConvosoRecording, lead: ConvosoLead | null): CombinedCallData {
    return {
      // Recording data
      recording_id: recording.recording_id,
      lead_id: recording.lead_id,
      start_time: recording.start_time,
      end_time: recording.end_time,
      duration_seconds: parseFloat(recording.seconds || '0'),
      recording_url: recording.url,

      // Lead data (with fallbacks if not found)
      customer_first_name: lead?.first_name || '',
      customer_last_name: lead?.last_name || '',
      customer_phone: lead?.phone_number || '',
      customer_email: lead?.email || '',
      agent_id: lead?.user_id || '',
      // Handle "System User" for automated/abandoned calls
      agent_name: (lead?.user_name === 'System User' || !lead?.user_name)
        ? 'Auto-Detected'
        : lead.user_name,
      disposition: lead?.status_name || lead?.status || 'UNKNOWN',
      campaign_name: lead?.campaign_name || 'Unknown Campaign',
      list_name: lead?.directory_name || lead?.list_id || 'Unknown List'
    };
  }

  /**
   * Get control settings from database
   */
  async getControlSettings(): Promise<ControlSettings> {
    const { data, error } = await this.supabase
      .from('convoso_control_settings')
      .select('*')
      .single();

    if (error || !data) {
      // Return default settings if not found
      return {
        system_enabled: false,
        active_campaigns: [],
        active_lists: [],
        active_dispositions: [],
        active_agents: []
      };
    }

    return {
      system_enabled: data.system_enabled,
      active_campaigns: data.active_campaigns || [],
      active_lists: data.active_lists || [],
      active_dispositions: data.active_dispositions || [],
      active_agents: data.active_agents || []
    };
  }

  /**
   * Update control settings
   */
  async updateControlSettings(settings: Partial<ControlSettings>): Promise<boolean> {
    const { error } = await this.supabase
      .from('convoso_control_settings')
      .update({
        ...settings,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);

    if (error) {
      console.error('[ConvosoService] Error updating control settings:', error);
      return false;
    }

    return true;
  }

  /**
   * Apply filters based on control settings
   */
  applyFilters(calls: CombinedCallData[], settings: ControlSettings): CombinedCallData[] {
    if (!settings.system_enabled) {
      console.log('[ConvosoService] System disabled, returning empty array');
      return [];
    }

    // Always filter out 0-second calls (abandoned/failed)
    let filtered = calls.filter(call => call.duration_seconds > 0);

    // Filter by campaigns
    if (settings.active_campaigns.length > 0) {
      filtered = filtered.filter(call =>
        settings.active_campaigns.includes(call.campaign_name)
      );
    }

    // Filter by lists
    if (settings.active_lists.length > 0) {
      filtered = filtered.filter(call =>
        settings.active_lists.includes(call.list_name)
      );
    }

    // Filter by dispositions
    if (settings.active_dispositions.length > 0) {
      filtered = filtered.filter(call =>
        settings.active_dispositions.includes(call.disposition)
      );
    }

    // Filter by agents
    if (settings.active_agents.length > 0) {
      filtered = filtered.filter(call =>
        settings.active_agents.includes(call.agent_name)
      );
    }

    console.log(`[ConvosoService] Filtered ${calls.length} calls to ${filtered.length} based on control settings`);
    return filtered;
  }

  /**
   * Fetch and combine all data for a date range using the new log/retrieve endpoint with pagination
   */
  async fetchCompleteCallData(dateFrom: string, dateTo: string, progressCallback?: (fetched: number, total: number) => void): Promise<CombinedCallData[]> {
    // Convert date format from YYYY-MM-DD to YYYY-MM-DD HH:MM:SS
    const formatDateTime = (date: string) => {
      if (date.includes(' ')) return date; // Already formatted
      if (date.includes(':')) return date; // Has time
      return `${date} 00:00:00`; // Add start of day
    };

    const formatEndDateTime = (date: string) => {
      if (date.includes(' ')) return date; // Already formatted
      if (date.includes(':')) return date; // Has time
      return `${date} 23:59:59`; // Add end of day
    };

    const allCalls: CombinedCallData[] = [];
    let offset = 0;
    const limit = 10000; // Convoso API max limit per request
    let totalFound = 0;
    let hasMore = true;

    console.log(`[ConvosoService] Fetching complete call data from ${formatDateTime(dateFrom)} to ${formatEndDateTime(dateTo)}`);

    while (hasMore) {
      const params = new URLSearchParams({
        auth_token: CONVOSO_AUTH_TOKEN!,
        start_time: formatDateTime(dateFrom),
        end_time: formatEndDateTime(dateTo),
        include_recordings: '1',
        limit: String(limit),
        offset: String(offset)
      });

      const url = `${CONVOSO_API_BASE}/log/retrieve?${params.toString()}`;
      console.log(`[ConvosoService] Fetching page: offset=${offset}, limit=${limit}`);

      try {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        // Check for API error
        if (data.success === false) {
          throw new Error(data.text || data.error || 'API returned failure');
        }

        // Extract and transform call logs to our format
        if (data.data && data.data.results) {
          totalFound = data.data.total_found || 0;
          const pageResults = data.data.results;

          console.log(`[ConvosoService] Page ${Math.floor(offset / limit) + 1}: Found ${totalFound} total calls, fetched ${pageResults.length} in this page`);

          // Transform log entries to CombinedCallData structure
          // NO FILTERS - let the UI handle filtering
          const combinedData = pageResults
            .map((entry: any): CombinedCallData => ({
              // Recording data
              recording_id: entry.recording?.[0]?.recording_id || entry.id,
              lead_id: entry.lead_id,
              start_time: entry.call_date,
              end_time: entry.call_date, // API doesn't provide separate end time
              duration_seconds: parseInt(entry.call_length) || 0,
              recording_url: entry.recording?.[0]?.public_url || entry.recording?.[0]?.src || '',

              // Lead data (now included in the log entry)
              customer_first_name: entry.first_name || '',
              customer_last_name: entry.last_name || '',
              customer_phone: entry.phone_number || '',
              customer_email: '', // Not provided in log/retrieve
              agent_id: entry.user_id || '',
              agent_name: entry.user || '',
              disposition: entry.status_name || entry.status || 'UNKNOWN',
              campaign_name: entry.campaign || 'Unknown Campaign',
              list_name: entry.list_id || 'Unknown List'
            }));

          allCalls.push(...combinedData);

          // Report progress if callback provided
          if (progressCallback) {
            progressCallback(allCalls.length, totalFound);
          }

          // Check if we need to fetch more pages
          if (pageResults.length < limit || allCalls.length >= totalFound) {
            hasMore = false;
          } else {
            offset += limit;
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } else {
          hasMore = false;
        }
      } catch (error: any) {
        console.error(`[ConvosoService] Error fetching page at offset ${offset}:`, error);
        // If we've already fetched some data, return what we have
        if (allCalls.length > 0) {
          console.warn(`[ConvosoService] Returning partial results: ${allCalls.length} calls fetched before error`);
          return allCalls;
        }
        throw error;
      }
    }

    console.log(`[ConvosoService] Completed fetching ${allCalls.length} calls out of ${totalFound} total`);
    return allCalls;
  }

  /**
   * Save calls to database
   */
  async saveCallsToDatabase(calls: CombinedCallData[], userId?: string): Promise<number> {
    let savedCount = 0;

    for (const call of calls) {
      const callData = {
        call_id: `convoso_${call.recording_id}`,
        convoso_lead_id: call.lead_id,
        lead_id: call.lead_id,  // Add lead_id field
        agent_name: call.agent_name,
        agent_email: null,
        disposition: call.disposition,
        duration_sec: call.duration_seconds,  // Changed from duration to duration_sec
        phone_number: call.customer_phone,
        recording_url: call.recording_url,
        campaign: call.campaign_name,
        started_at: call.start_time,
        ended_at: call.end_time,
        office_id: 1,
        source: call.source || 'manual',
        metadata: {
          customer_name: `${call.customer_first_name} ${call.customer_last_name}`.trim(),
          customer_email: call.customer_email,
          list_name: call.list_name,
          imported_by: userId,
          imported_at: new Date().toISOString()
        }
      };

      const { error } = await this.supabase
        .from('calls')
        .upsert(callData, {
          onConflict: 'call_id',
          ignoreDuplicates: false
        });

      if (!error) {
        savedCount++;
      } else {
        console.error(`[ConvosoService] Error saving call ${call.recording_id}:`, error);
      }
    }

    return savedCount;
  }

  // Cache helpers
  private getCachedLead(leadId: string): ConvosoLead | null {
    const cached = leadCache.get(leadId);
    const timestamp = this.leadCacheTimestamps.get(leadId);

    if (cached && timestamp && (Date.now() - timestamp) < CACHE_TTL) {
      return cached;
    }

    return null;
  }

  private cacheLeadData(leadId: string, lead: ConvosoLead): void {
    leadCache.set(leadId, lead);
    this.leadCacheTimestamps.set(leadId, Date.now());
  }

  /**
   * Get unique values for filters from a set of calls
   */
  getFilterOptions(calls: CombinedCallData[]) {
    const campaigns = [...new Set(calls.map(c => c.campaign_name))].sort();
    const lists = [...new Set(calls.map(c => c.list_name))].sort();
    const dispositions = [...new Set(calls.map(c => c.disposition))].sort();
    const agents = [...new Set(calls.map(c => c.agent_name))].sort();

    return {
      campaigns,
      lists,
      dispositions,
      agents
    };
  }
}