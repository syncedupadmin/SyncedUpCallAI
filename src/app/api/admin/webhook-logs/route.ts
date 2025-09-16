import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { isAdminAuthenticated, unauthorizedResponse } from '@/src/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return unauthorizedResponse();
  }

  try {
    // Get webhook logs from call_events table
    const logs = await db.manyOrNone(`
      SELECT
        ce.id,
        ce.call_id,
        ce.type,
        ce.payload,
        ce.at as created_at,
        ce.created_at as actual_created_at,
        c.source,
        c.campaign,
        c.disposition
      FROM call_events ce
      LEFT JOIN calls c ON c.id = ce.call_id
      -- Show all call events, not just webhooks
      WHERE ce.type IN ('webhook_received', 'call_created', 'system_disposition_skipped')
        OR ce.type IS NOT NULL
      ORDER BY COALESCE(ce.at, ce.created_at) DESC
      LIMIT 500
    `);

    // Transform logs for display
    const transformedLogs = logs.map(log => {
      const payload = log.payload || {};
      return {
        id: log.id,
        type: payload.lead_id ? 'lead' : 'call',
        status: 'success',
        data: {
          name: payload.agent_name || payload.lead_data?.first_name 
            ? `${payload.lead_data?.first_name || ''} ${payload.lead_data?.last_name || ''}`.trim() 
            : undefined,
          phone: payload.phone_number || payload.lead_data?.phone_number,
          email: payload.lead_data?.email,
          agent: payload.agent_name,
          campaign: log.campaign,
          disposition: log.disposition,
          ...payload
        },
        created_at: log.created_at,
        error: null
      };
    });

    return NextResponse.json({
      ok: true,
      data: transformedLogs
    });
  } catch (error: any) {
    console.error('Error fetching webhook logs:', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      data: []
    });
  }
}