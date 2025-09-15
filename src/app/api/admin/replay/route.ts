import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { isAdminAuthenticated, unauthorizedResponse } from '@/src/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Check admin authentication
    if (!isAdminAuthenticated(req)) {
      return unauthorizedResponse();
    }

    const body = await req.json();
    const { ids, limit = 10 } = body;

    let query: string;
    let params: any[];

    if (ids && ids.length > 0) {
      // Replay specific events by IDs
      query = `
        UPDATE call_events 
        SET type = 'webhook_received', 
            payload = jsonb_set(payload, '{replayed}', 'true'::jsonb)
        WHERE id = ANY($1) AND type = 'quarantine'
        RETURNING id
      `;
      params = [ids];
    } else {
      // Replay latest N quarantined events
      query = `
        WITH quarantined AS (
          SELECT id 
          FROM call_events 
          WHERE type = 'quarantine' 
          ORDER BY created_at DESC 
          LIMIT $1
        )
        UPDATE call_events 
        SET type = 'webhook_received',
            payload = jsonb_set(payload, '{replayed}', 'true'::jsonb)
        WHERE id IN (SELECT id FROM quarantined)
        RETURNING id
      `;
      params = [limit];
    }

    const result = await db.result(query, params);
    const enqueued = result.rowCount || 0;

    console.log(`[Replay] Re-enqueued ${enqueued} quarantined events`);

    return NextResponse.json({
      ok: true,
      enqueued
    });

  } catch (error: any) {
    console.error('[Replay] Error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to replay events'
    }, { status: 500 });
  }
}