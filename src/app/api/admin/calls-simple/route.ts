import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { createClient } from '@/src/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Simple check - just verify user is authenticated and is admin
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        ok: false,
        error: 'Not authenticated',
        data: []
      }, { status: 401 });
    }

    // Check if user is admin using the is_super_admin function (now equivalent to is_admin)
    const { data: isAdmin } = await supabase.rpc('is_super_admin');

    if (!isAdmin) {
      return NextResponse.json({
        ok: false,
        error: 'Not an admin',
        data: []
      }, { status: 403 });
    }

    // Fetch calls with real data
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
        COALESCE(c.agent_name, a.name) as agent_name,
        COALESCE(c.phone_number, ct.primary_phone) as phone_number,
        c.lead_id,
        c.created_at,
        c.updated_at,
        c.metadata
      FROM calls c
      LEFT JOIN agents a ON a.id = c.agent_id
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      -- Show all calls
      WHERE 1=1
      ORDER BY c.created_at DESC
      LIMIT 200
    `);

    // Enhance calls with metadata extraction for missing phone numbers
    const enhancedCalls = calls.map(call => {
      // Try to extract phone from metadata if main field is empty
      let phone = call.phone_number;
      if (!phone && call.metadata) {
        try {
          const meta = typeof call.metadata === 'string' ? JSON.parse(call.metadata) : call.metadata;
          phone = meta.phone_number || meta.customer_phone || meta.phone ||
                 meta.lead_phone || meta.to_number || meta.from_number ||
                 meta.lead?.phone || meta.customer?.phone || null;
        } catch (e) {
          // Ignore JSON parse errors
        }
      }

      return {
        ...call,
        agent_name: call.agent_name || null,
        phone_number: phone || null,
        // Ensure dates are valid
        started_at: call.started_at || call.created_at,
        ended_at: call.ended_at || call.created_at,
        // Ensure direction has a value
        direction: call.direction || 'outbound'
      };
    });

    return NextResponse.json({
      ok: true,
      data: enhancedCalls,
      count: enhancedCalls.length
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