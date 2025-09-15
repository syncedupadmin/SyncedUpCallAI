import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Get current user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // For now, return all calls for authenticated users
    // You can add filtering by user later if needed
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
        a.name as agent_name,
        ce.payload->>'agent_name' as webhook_agent_name,
        ce.payload->>'phone_number' as phone_number
      FROM calls c
      LEFT JOIN agents a ON a.id = c.agent_id
      LEFT JOIN call_events ce ON ce.call_id = c.id AND ce.type = 'webhook_received'
      WHERE c.source = 'convoso'
      ORDER BY c.started_at DESC
      LIMIT 100
    `);

    // Enhance with agent names from webhook data if not in agents table
    const enhancedCalls = calls.map(call => ({
      ...call,
      agent_name: call.agent_name || call.webhook_agent_name
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