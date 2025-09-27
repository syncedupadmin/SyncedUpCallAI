import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { getAdminContext, unauthorizedResponse } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Get admin context with agency info
  const adminContext = await getAdminContext(req);
  if (!adminContext) {
    return unauthorizedResponse();
  }

  try {
    // Build agency filter - super admins see all, agency admins see only their agencies
    let agencyFilter = '';
    let queryParams: any[] = [];

    if (!adminContext.isSuperAdmin && adminContext.agencyIds.length > 0) {
      agencyFilter = 'AND c.agency_id = ANY($1)';
      queryParams = [adminContext.agencyIds];
    }

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
        c.agency_id,
        a.name as agent_full_name,
        ce.payload->>'agent_name' as webhook_agent_name,
        ce.payload->>'phone_number' as webhook_phone_number
      FROM calls c
      LEFT JOIN agents a ON a.id = c.agent_id
      LEFT JOIN call_events ce ON ce.call_id = c.id AND ce.type = 'webhook_received'
      WHERE 1=1 ${agencyFilter}
      ORDER BY c.created_at DESC
      LIMIT 500
    `, queryParams);

    // Enhance with data from multiple sources
    const enhancedCalls = calls.map(call => ({
      ...call,
      agent_name: call.agent_name || call.agent_full_name || call.webhook_agent_name,
      phone_number: call.phone_number || call.webhook_phone_number
    }));

    return NextResponse.json({
      ok: true,
      data: enhancedCalls,
      filtered_by_agencies: !adminContext.isSuperAdmin,
      agency_count: adminContext.agencyIds.length
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