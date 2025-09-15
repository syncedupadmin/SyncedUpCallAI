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
    // Get lead data from call_events payloads
    const leadEvents = await db.manyOrNone(`
      SELECT 
        ce.id,
        ce.call_id,
        ce.payload,
        ce.at as created_at
      FROM call_events ce
      WHERE ce.type = 'webhook_received'
        AND ce.payload->>'lead_id' IS NOT NULL
      ORDER BY ce.at DESC
      LIMIT 100
    `);

    // Transform into lead format
    const leads = leadEvents.map(event => {
      const payload = event.payload || {};
      const leadData = payload.lead_data || {};
      
      return {
        id: payload.lead_id || event.id,
        first_name: leadData.first_name || payload.first_name,
        last_name: leadData.last_name || payload.last_name,
        phone: leadData.phone_number || payload.phone_number,
        email: leadData.email || payload.email,
        campaign: payload.campaign,
        agent: payload.agent_name,
        converted: false, // Could check if there's a matching call
        created_at: event.created_at,
        raw_data: payload
      };
    });

    return NextResponse.json({
      ok: true,
      data: leads
    });
  } catch (error: any) {
    console.error('Error fetching leads:', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      data: []
    });
  }
}