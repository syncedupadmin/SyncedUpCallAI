import { db } from '../db';
import { ConvosoCall, ConvosoSyncStatus } from '../convoso/types';
import crypto from 'crypto';

/**
 * Normalize phone number to digits only
 */
function normalizePhone(phone?: string): string | null {
  if (!phone) return null;
  return phone.replace(/[^0-9]/g, '');
}

/**
 * Generate deterministic UUID from Convoso call ID
 */
function generateCallId(convosoId: string): string {
  const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Standard UUID namespace
  const hash = crypto.createHash('sha1');
  hash.update(namespace.replace(/-/g, ''), 'hex');
  hash.update(convosoId, 'utf8');
  const hashBytes = hash.digest();

  // Format as UUID v5
  const uuid = [
    hashBytes.toString('hex', 0, 4),
    hashBytes.toString('hex', 4, 6),
    ((hashBytes[6] & 0x0f) | 0x50).toString(16) + hashBytes.toString('hex', 7, 8),
    ((hashBytes[8] & 0x3f) | 0x80).toString(16) + hashBytes.toString('hex', 9, 10),
    hashBytes.toString('hex', 10, 16),
  ].join('-');

  return uuid;
}

/**
 * Upsert one Convoso call into our calls table
 */
export async function upsertConvosoCall(c: ConvosoCall): Promise<{ inserted: boolean; updated: boolean }> {
  try {
    const callId = generateCallId(c.id);
    const normalizedPhone = normalizePhone(c.lead_phone);

    // First, try to upsert the agent if we have agent info
    let agentId: string | null = null;
    if (c.agent_id || c.agent) {
      try {
        const agentResult = await db.oneOrNone(`
          INSERT INTO agents (id, ext_ref, name, team, active)
          VALUES (gen_random_uuid(), $1, $2, 'convoso', true)
          ON CONFLICT (ext_ref) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, agents.name),
            active = true
          RETURNING id
        `, [
          c.agent_id || c.agent,
          c.agent || c.agent_id
        ]);
        agentId = agentResult?.id ?? null;
      } catch (agentError) {
        console.log('Could not upsert agent:', agentError);
      }
    }

    // Build metadata object
    const metadata = {
      convoso: {
        id: c.id,
        queue: c.queue,
        language: c.language,
        tags: c.tags,
        raw: c.raw,
      },
      normalized_phone: normalizedPhone,
    };

    // Check if call exists
    const existing = await db.oneOrNone(`
      SELECT id FROM calls WHERE id = $1
    `, [callId]);

    if (existing) {
      // Update existing call
      await db.none(`
        UPDATE calls SET
          source = 'convoso',
          source_ref = $2,
          agent_id = COALESCE($3, agent_id),
          agent_name = COALESCE($4, agent_name),
          lead_id = COALESCE($5, lead_id),
          campaign = COALESCE($6, campaign),
          direction = COALESCE($7, direction),
          started_at = COALESCE($8, started_at),
          ended_at = COALESCE($9, ended_at),
          duration_sec = COALESCE($10, duration_sec),
          talk_time_sec = COALESCE($11, talk_time_sec),
          wrap_time_sec = COALESCE($12, wrap_time_sec),
          recording_url = COALESCE($13, recording_url),
          disposition = COALESCE($14, disposition),
          queue = COALESCE($15, queue),
          language = COALESCE($16, language),
          tags = COALESCE($17, tags),
          metadata = COALESCE($18, metadata),
          updated_at = NOW()
        WHERE id = $1
      `, [
        callId,
        c.id,
        agentId,
        c.agent,
        c.lead_id,
        c.campaign,
        c.direction || 'outbound',
        c.started_at ? new Date(c.started_at) : null,
        c.ended_at ? new Date(c.ended_at) : null,
        c.duration_sec,
        c.talk_time_sec,
        c.wrap_time_sec,
        c.recording_url,
        c.disposition,
        c.queue,
        c.language,
        c.tags ? `{${c.tags.join(',')}}` : null,
        JSON.stringify(metadata),
      ]);

      return { inserted: false, updated: true };
    } else {
      // Insert new call
      await db.none(`
        INSERT INTO calls (
          id,
          source,
          source_ref,
          agent_id,
          agent_name,
          lead_id,
          campaign,
          direction,
          started_at,
          ended_at,
          duration_sec,
          talk_time_sec,
          wrap_time_sec,
          recording_url,
          disposition,
          queue,
          language,
          tags,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19,
          NOW(), NOW()
        )
      `, [
        callId,
        'convoso',
        c.id,
        agentId,
        c.agent,
        c.lead_id,
        c.campaign,
        c.direction || 'outbound',
        c.started_at ? new Date(c.started_at) : null,
        c.ended_at ? new Date(c.ended_at) : null,
        c.duration_sec,
        c.talk_time_sec,
        c.wrap_time_sec,
        c.recording_url,
        c.disposition,
        c.queue,
        c.language,
        c.tags ? `{${c.tags.join(',')}}` : null,
        JSON.stringify(metadata),
      ]);

      return { inserted: true, updated: false };
    }
  } catch (error: any) {
    console.error('Error upserting Convoso call:', error.message);
    throw error;
  }
}

/**
 * Record sync progress into convoso_sync_status table
 */
export async function recordSyncStatus(status: ConvosoSyncStatus): Promise<void> {
  try {
    await db.none(`
      INSERT INTO convoso_sync_status (
        sync_type,
        started_at,
        completed_at,
        from_date,
        to_date,
        records_processed,
        records_inserted,
        records_updated,
        records_failed,
        error_message,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      status.sync_type,
      status.started_at,
      status.completed_at || null,
      status.from_date || null,
      status.to_date || null,
      status.records_processed,
      status.records_inserted,
      status.records_updated,
      status.records_failed,
      status.error_message || null,
      status.metadata ? JSON.stringify(status.metadata) : null,
    ]);
  } catch (error: any) {
    console.error('Error recording sync status:', error.message);
    // Don't throw - this is just logging
  }
}

/**
 * Get calls grouped by agent with filters
 */
export async function getCallsGroupedByAgent(params: {
  from?: string;
  to?: string;
  agent?: string;
  disposition?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  rows: Array<{
    agent: string;
    agent_id: string | null;
    calls: number;
    avgDurationSec: number;
    completedRate: number;
    totalDuration: number;
    lastCall: string;
  }>;
  total: number;
}> {
  try {
    const {
      from,
      to,
      agent,
      disposition,
      limit = 20,
      offset = 0,
    } = params;

    // Build WHERE conditions
    const conditions: string[] = ["source = 'convoso'", "agent_name IS NOT NULL"];
    const values: any[] = [];
    let paramCount = 0;

    if (from) {
      conditions.push(`started_at >= $${++paramCount}`);
      values.push(new Date(from));
    }
    if (to) {
      conditions.push(`started_at <= $${++paramCount}`);
      values.push(new Date(to));
    }
    if (agent) {
      conditions.push(`agent_name ILIKE $${++paramCount}`);
      values.push(`%${agent}%`);
    }
    if (disposition) {
      conditions.push(`disposition = $${++paramCount}`);
      values.push(disposition);
    }

    const whereClause = conditions.join(' AND ');

    // Get grouped data
    const query = `
      SELECT
        agent_name as agent,
        agent_id,
        COUNT(*) as calls,
        COALESCE(AVG(duration_sec) FILTER (WHERE duration_sec > 0), 0)::int as "avgDurationSec",
        COALESCE(
          COUNT(*) FILTER (WHERE disposition IN ('SALE', 'Completed', 'Success'))::float /
          NULLIF(COUNT(*), 0),
          0
        ) as "completedRate",
        COALESCE(SUM(duration_sec), 0)::int as "totalDuration",
        MAX(started_at)::text as "lastCall"
      FROM calls
      WHERE ${whereClause}
      GROUP BY agent_name, agent_id
      ORDER BY calls DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const rows = await db.manyOrNone(query, values);

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT agent_name) as total
      FROM calls
      WHERE ${whereClause}
    `;

    const countResult = await db.one(countQuery, values);
    const total = parseInt(countResult.total);

    return {
      rows: rows || [],
      total,
    };
  } catch (error: any) {
    console.error('Error getting grouped calls:', error.message);
    throw error;
  }
}