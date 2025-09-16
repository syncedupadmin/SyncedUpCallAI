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

    // Check if user is admin using the is_admin function
    const { data: isAdmin } = await supabase.rpc('is_admin');

    if (!isAdmin) {
      return NextResponse.json({
        ok: false,
        error: 'Not an admin',
        data: []
      }, { status: 403 });
    }

    // Fetch calls with better data population
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
        COALESCE(c.agent_name, a.name, 'Test Agent') as agent_name,
        COALESCE(c.phone_number, ct.phone_e164, ct.primary_phone, '555-0000') as phone_number,
        c.lead_id,
        c.created_at,
        c.updated_at
      FROM calls c
      LEFT JOIN agents a ON a.id = c.agent_id
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      -- Show all calls
      WHERE 1=1
      ORDER BY c.created_at DESC
      LIMIT 200
    `);

    // Enhance with fallback values for display
    const enhancedCalls = calls.map(call => ({
      ...call,
      agent_name: call.agent_name || 'Test Agent',
      phone_number: call.phone_number || '555-0000',
      // Ensure dates are valid
      started_at: call.started_at || call.created_at,
      ended_at: call.ended_at || call.created_at
    }));

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