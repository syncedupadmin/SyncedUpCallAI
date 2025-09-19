import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated, unauthorizedResponse } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return unauthorizedResponse();
  }

  try {
    const calls = await db.manyOrNone(`
      SELECT
        c.id,
        c.source,
        c.source_ref,
        c.campaign,
        c.disposition,
        c.direction,
        c.started_at,
        c.ended_at,
        c.duration_sec,
        c.recording_url,
        c.agent_id,
        c.agent_name,
        c.phone_number,
        c.lead_id,
        c.created_at,
        c.updated_at,
        a.name as agent_full_name,
        ce.payload->>'agent_name' as webhook_agent_name,
        ce.payload->>'phone_number' as webhook_phone_number
      FROM calls c
      LEFT JOIN agents a ON a.id = c.agent_id
      LEFT JOIN call_events ce ON ce.call_id = c.id AND ce.type = 'webhook_received'
      -- Show all calls, not just convoso
      WHERE 1=1
      ORDER BY c.created_at DESC
      LIMIT 500
    `);

    // Enhance with data from multiple sources
    const enhancedCalls = calls.map(call => ({
      ...call,
      agent_name: call.agent_name || call.agent_full_name || call.webhook_agent_name,
      phone_number: call.phone_number || call.webhook_phone_number
    }));

    return NextResponse.json({
      ok: true,
      data: enhancedCalls
    });
  } catch (error: any) {
    console.error('Error fetching calls:', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      data: []
    });
  }
}