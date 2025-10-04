/**
 * Compliance Convoso Integration Service
 * Handles 2-part workflow: Agent discovery → Sales call fetching
 */

import { db } from '@/server/db';
import { logInfo, logError } from '@/lib/log';
import { decryptData, decryptConvosoCredentials } from '@/lib/crypto';

interface ConvosoAgent {
  id: string;
  name: string;
  email?: string;
  campaign_id?: string;
  status: 'active' | 'inactive';
}

interface ConvosoCall {
  id: string;
  agent_id: string;
  agent_name: string;
  campaign_id: string;
  list_id: string;
  phone_number: string;
  disposition: string;
  call_date: string;
  call_time: string;
  duration: number;
  recording_url?: string;
  transcript?: string;
  sale_amount?: number;
  product_type?: string;
  state?: string;
}

interface AgencySyncConfig {
  agency_id: string;
  agency_name: string;
  convoso_credentials: {
    auth_token?: string;
    api_url?: string;
    account_id?: string;
  };
  webhook_token?: string;
}

interface SyncResult {
  success: boolean;
  agents_discovered: number;
  sales_fetched: number;
  segments_created: number;
  errors: string[];
}

/**
 * Main orchestrator for Convoso compliance sync
 */
export class ComplianceConvosoService {
  private apiBaseUrl: string;
  private authToken: string;
  private agencyId: string;

  constructor(config: AgencySyncConfig) {
    this.agencyId = config.agency_id;
    this.apiBaseUrl = config.convoso_credentials.api_url || 'https://api.convoso.com';
    this.authToken = config.convoso_credentials.auth_token || '';
  }

  /**
   * Execute full 2-part sync workflow
   */
  async executeSyncWorkflow(dateRange?: { start: Date; end: Date }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      agents_discovered: 0,
      sales_fetched: 0,
      segments_created: 0,
      errors: []
    };

    try {
      logInfo({
        event_type: 'compliance_sync_start',
        agency_id: this.agencyId,
        date_range: dateRange
      });

      // Part 1: Discover and sync agents
      const agents = await this.discoverAgents();
      result.agents_discovered = agents.length;

      if (agents.length === 0) {
        result.errors.push('No agents found in Convoso');
        await this.logSync('agent_discovery', 'failed', result);
        return result;
      }

      // Store/update agents in config
      await this.syncAgentConfigurations(agents);

      // Part 2: Fetch sales calls for each agent
      const salesCalls = await this.fetchSalesForAgents(agents, dateRange);
      result.sales_fetched = salesCalls.length;

      if (salesCalls.length > 0) {
        // Process sales calls for compliance
        const segments = await this.createComplianceSegments(salesCalls);
        result.segments_created = segments;
      }

      result.success = true;
      await this.logSync('sales_fetch', 'success', result);

      logInfo({
        event_type: 'compliance_sync_complete',
        agency_id: this.agencyId,
        result
      });

    } catch (error: any) {
      logError('Compliance Convoso sync failed', error, {
        agency_id: this.agencyId
      });
      result.errors.push(error.message);
      await this.logSync('sales_fetch', 'failed', result);
    }

    return result;
  }

  /**
   * Part 1: Discover agents from Convoso
   */
  async discoverAgents(): Promise<ConvosoAgent[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/users`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Convoso API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const agents: ConvosoAgent[] = data.agents || data.data || [];

      // Filter for active agents only
      const activeAgents = agents.filter(agent =>
        agent.status === 'active' || !agent.status
      );

      logInfo({
        event_type: 'agents_discovered',
        agency_id: this.agencyId,
        total_agents: agents.length,
        active_agents: activeAgents.length
      });

      return activeAgents;

    } catch (error: any) {
      logError('Failed to discover agents', error, {
        agency_id: this.agencyId
      });
      throw error;
    }
  }

  /**
   * Store agent configurations for monitoring
   */
  async syncAgentConfigurations(agents: ConvosoAgent[]): Promise<void> {
    try {
      for (const agent of agents) {
        await db.none(`
          INSERT INTO compliance_agent_config (
            agency_id,
            convoso_agent_id,
            agent_name,
            agent_email,
            monitor_enabled,
            auto_sync_sales,
            sync_status
          ) VALUES ($1, $2, $3, $4, true, true, 'pending')
          ON CONFLICT (agency_id, convoso_agent_id)
          DO UPDATE SET
            agent_name = EXCLUDED.agent_name,
            agent_email = EXCLUDED.agent_email,
            updated_at = NOW()
        `, [
          this.agencyId,
          agent.id,
          agent.name,
          agent.email || null
        ]);
      }

      logInfo({
        event_type: 'agent_configs_synced',
        agency_id: this.agencyId,
        agents_synced: agents.length
      });

    } catch (error: any) {
      logError('Failed to sync agent configurations', error, {
        agency_id: this.agencyId
      });
      throw error;
    }
  }

  /**
   * Part 2: Fetch sales calls for specific agents
   */
  async fetchSalesForAgents(
    agents: ConvosoAgent[],
    dateRange?: { start: Date; end: Date }
  ): Promise<ConvosoCall[]> {
    const allSalesCalls: ConvosoCall[] = [];

    // Default to last 7 days if no range specified
    const endDate = dateRange?.end || new Date();
    const startDate = dateRange?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      // Get monitored agents from config
      const monitoredAgents = await db.manyOrNone(`
        SELECT convoso_agent_id, agent_name
        FROM compliance_agent_config
        WHERE agency_id = $1
        AND monitor_enabled = true
        AND auto_sync_sales = true
      `, [this.agencyId]);

      const agentIds = monitoredAgents.map(a => a.convoso_agent_id);

      for (const agentId of agentIds) {
        try {
          const agentCalls = await this.fetchAgentSalesCalls(
            agentId,
            startDate,
            endDate
          );
          allSalesCalls.push(...agentCalls);

          // Update last sync timestamp
          await db.none(`
            UPDATE compliance_agent_config
            SET last_synced_at = NOW(),
                sync_status = 'success',
                total_sales_synced = total_sales_synced + $2
            WHERE agency_id = $1 AND convoso_agent_id = $3
          `, [this.agencyId, agentCalls.length, agentId]);

        } catch (error: any) {
          logInfo({
            event_type: 'agent_sales_fetch_failed',
            agency_id: this.agencyId,
            agent_id: agentId,
            error: error.message
          });

          // Update agent sync status
          await db.none(`
            UPDATE compliance_agent_config
            SET sync_status = 'failed',
                sync_error = $2,
                last_synced_at = NOW()
            WHERE agency_id = $1 AND convoso_agent_id = $3
          `, [this.agencyId, error.message, agentId]);
        }
      }

      logInfo({
        event_type: 'sales_calls_fetched',
        agency_id: this.agencyId,
        agents_processed: agentIds.length,
        total_sales: allSalesCalls.length,
        date_range: { start: startDate, end: endDate }
      });

      return allSalesCalls;

    } catch (error: any) {
      logError('Failed to fetch sales for agents', error, {
        agency_id: this.agencyId
      });
      throw error;
    }
  }

  /**
   * Fetch sales calls for a specific agent
   */
  private async fetchAgentSalesCalls(
    agentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ConvosoCall[]> {
    try {
      const params = new URLSearchParams({
        agent_id: agentId,
        disposition: 'SALE',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        include_recording: 'true',
        include_transcript: 'true'
      });

      const response = await fetch(`${this.apiBaseUrl}/reports/calls?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Convoso API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const calls: ConvosoCall[] = data.calls || data.data || [];

      // Filter for SALE disposition only
      const salesCalls = calls.filter(call =>
        call.disposition === 'SALE' ||
        call.disposition === 'Sale' ||
        call.disposition?.toLowerCase().includes('sale')
      );

      logInfo({
        event_type: 'agent_sales_fetched',
        agency_id: this.agencyId,
        agent_id: agentId,
        total_calls: calls.length,
        sales_calls: salesCalls.length
      });

      return salesCalls;

    } catch (error: any) {
      logError('Failed to fetch agent sales calls', error, {
        agency_id: this.agencyId,
        agent_id: agentId
      });
      throw error;
    }
  }

  /**
   * Create compliance segments from Convoso sales calls
   */
  async createComplianceSegments(calls: ConvosoCall[]): Promise<number> {
    let segmentsCreated = 0;

    try {
      for (const call of calls) {
        try {
          // Check if call already exists
          const existingCall = await db.oneOrNone(`
            SELECT id FROM calls
            WHERE convoso_id = $1 OR external_id = $1
          `, [call.id]);

          let callId: string;

          if (existingCall) {
            callId = existingCall.id;

            // Update call with Convoso metadata
            await db.none(`
              UPDATE calls SET
                convoso_agent_id = $2,
                convoso_campaign_id = $3,
                convoso_list_id = $4,
                convoso_disposition = $5,
                compliance_required = true,
                compliance_processed = false
              WHERE id = $1
            `, [
              callId,
              call.agent_id,
              call.campaign_id,
              call.list_id,
              call.disposition
            ]);
          } else {
            // Create new call record
            const newCall = await db.one(`
              INSERT INTO calls (
                agency_id,
                convoso_id,
                external_id,
                phone_number,
                agent_name,
                convoso_agent_id,
                convoso_campaign_id,
                convoso_list_id,
                disposition,
                convoso_disposition,
                duration,
                recording_url,
                transcript_text,
                product_type,
                state,
                compliance_required,
                compliance_processed,
                created_at
              ) VALUES (
                $1, $2, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12, $13,
                true, false, $14
              ) RETURNING id
            `, [
              this.agencyId,
              call.id,
              call.phone_number,
              call.agent_name,
              call.agent_id,
              call.campaign_id,
              call.list_id,
              call.disposition,
              call.duration,
              call.recording_url,
              call.transcript,
              call.product_type,
              call.state,
              new Date(`${call.call_date} ${call.call_time}`)
            ]);
            callId = newCall.id;
          }

          // Check if segment already exists
          const existingSegment = await db.oneOrNone(`
            SELECT id FROM post_close_segments
            WHERE call_id = $1
          `, [callId]);

          if (!existingSegment && call.transcript) {
            // Extract post-close segment (simplified - assumes entire transcript for now)
            // In production, you'd analyze the transcript to find the actual post-close portion
            await db.none(`
              INSERT INTO post_close_segments (
                call_id,
                agency_id,
                convoso_call_id,
                convoso_agent_id,
                convoso_campaign_id,
                convoso_list_id,
                convoso_disposition,
                agent_name,
                transcript,
                start_ms,
                end_ms,
                duration_sec,
                sale_confirmed,
                disposition,
                extraction_method,
                convoso_sync_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                0, $10, $11, true, $7, 'convoso_sync', NOW()
              )
            `, [
              callId,
              this.agencyId,
              call.id,
              call.agent_id,
              call.campaign_id,
              call.list_id,
              call.disposition,
              call.agent_name,
              call.transcript,
              call.duration * 1000, // Convert to ms
              call.duration
            ]);

            segmentsCreated++;
          }

        } catch (error: any) {
          logInfo({
            event_type: 'segment_creation_failed',
            agency_id: this.agencyId,
            convoso_call_id: call.id,
            error: error.message
          });
        }
      }

      logInfo({
        event_type: 'compliance_segments_created',
        agency_id: this.agencyId,
        calls_processed: calls.length,
        segments_created: segmentsCreated
      });

      return segmentsCreated;

    } catch (error: any) {
      logError('Failed to create compliance segments', error, {
        agency_id: this.agencyId
      });
      throw error;
    }
  }

  /**
   * Log sync operation to database
   */
  private async logSync(
    syncType: 'agent_discovery' | 'sales_fetch',
    status: 'success' | 'partial' | 'failed',
    result: SyncResult
  ): Promise<void> {
    try {
      await db.none(`
        INSERT INTO compliance_convoso_sync_log (
          agency_id,
          sync_type,
          calls_fetched,
          sales_found,
          compliance_segments_created,
          sync_status,
          error_message,
          api_response,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        this.agencyId,
        syncType,
        result.sales_fetched,
        result.sales_fetched,
        result.segments_created,
        status,
        result.errors.join('; ') || null,
        JSON.stringify(result)
      ]);
    } catch (error: any) {
      logError('Failed to log sync operation', error, {
        agency_id: this.agencyId
      });
    }
  }
}

/**
 * Factory function to create service instance
 */
export async function createComplianceConvosoService(
  agencyId: string
): Promise<ComplianceConvosoService | null> {
  try {
    // Get agency configuration with new fields
    const agency = await db.oneOrNone(`
      SELECT
        id,
        name,
        convoso_auth_token,
        convoso_base_url,
        convoso_credentials,
        webhook_token
      FROM agencies
      WHERE id = $1
    `, [agencyId]);

    if (!agency) {
      logError('Agency not found', new Error('Invalid agency ID'), { agency_id: agencyId });
      return null;
    }

    // Try new encrypted auth_token field first, then fall back to old convoso_credentials
    let authToken, apiUrl;

    if (agency.convoso_auth_token) {
      // Use new encrypted auth_token field
      const crypto = await import('crypto');

      // Get encryption key with proper error handling
      const encryptionKeySource = process.env.CONVOSO_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!encryptionKeySource) {
        logError('Missing encryption key', new Error('CONVOSO_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY must be set'), {
          agency_id: agencyId
        });
        return null;
      }
      const ENCRYPTION_KEY = crypto.createHash('sha256').update(encryptionKeySource).digest();

      // Decrypt function
      const decrypt = (text: string): string => {
        try {
          const parts = text.split(':');
          const iv = Buffer.from(parts[0], 'hex');
          const encryptedText = Buffer.from(parts[1], 'hex');
          const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
          let decrypted = decipher.update(encryptedText);
          decrypted = Buffer.concat([decrypted, decipher.final()]);
          return decrypted.toString();
        } catch (error) {
          // Decryption error already logged by logError
          return '';
        }
      };

      authToken = decrypt(agency.convoso_auth_token);
      apiUrl = agency.convoso_base_url || 'https://api.convoso.com/v1';

    } else if (agency.convoso_credentials) {
      // Fall back to old convoso_credentials field (could contain auth_token)
      let decryptedCreds;
      if (agency.convoso_credentials.encrypted) {
        // Credentials are encrypted using old method
        decryptedCreds = decryptConvosoCredentials(agency.convoso_credentials);
      } else {
        // Credentials are in plain JSON
        decryptedCreds = agency.convoso_credentials;
      }

      authToken = decryptedCreds.auth_token || decryptedCreds.api_token;
      apiUrl = decryptedCreds.api_url || 'https://api.convoso.com/v1';
    } else {
      logInfo({
        event_type: 'no_convoso_credentials',
        agency_id: agencyId,
        agency_name: agency.name
      });
      return null;
    }

    if (!authToken) {
      logInfo({
        event_type: 'missing_auth_token',
        agency_id: agencyId,
        agency_name: agency.name
      });
      return null;
    }

    const config: AgencySyncConfig = {
      agency_id: agencyId,
      agency_name: agency.name,
      convoso_credentials: {
        auth_token: authToken,
        api_url: apiUrl
      },
      webhook_token: agency.webhook_token
    };

    return new ComplianceConvosoService(config);

  } catch (error: any) {
    logError('Failed to create Convoso service', error, { agency_id: agencyId });
    return null;
  }
}

/**
 * Process all agencies with Convoso credentials
 */
export async function processAllAgencyCompliance(): Promise<void> {
  try {
    // Get all agencies with Convoso credentials
    const agencies = await db.manyOrNone(`
      SELECT id, name
      FROM agencies
      WHERE convoso_credentials IS NOT NULL
      AND convoso_credentials != '{}'::jsonb
    `);

    logInfo({
      event_type: 'compliance_batch_start',
      agencies_to_process: agencies.length
    });

    const results = await Promise.allSettled(
      agencies.map(async (agency) => {
        const service = await createComplianceConvosoService(agency.id);
        if (service) {
          return service.executeSyncWorkflow();
        }
        return null;
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success)).length;

    logInfo({
      event_type: 'compliance_batch_complete',
      total_agencies: agencies.length,
      successful,
      failed
    });

  } catch (error: any) {
    logError('Failed to process agency compliance', error);
  }
}