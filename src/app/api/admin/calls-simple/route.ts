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

    // Fetch calls
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
        a.name as agent_full_name
      FROM calls c
      LEFT JOIN agents a ON a.id = c.agent_id
      -- Show all calls
      WHERE 1=1
      ORDER BY c.created_at DESC
      LIMIT 200
    `);

    // Enhance with agent names
    const enhancedCalls = calls.map(call => ({
      ...call,
      agent_name: call.agent_name || call.agent_full_name || 'Unknown',
      phone_number: call.phone_number || 'Unknown'
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