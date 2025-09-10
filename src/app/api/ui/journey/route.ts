import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get('phone');
  
  if (!phone) {
    return NextResponse.json({ error: 'Phone parameter required' }, { status: 400 });
  }
  
  // Normalize phone to digits only
  const normalizedPhone = phone.replace(/\D/g, '');
  
  try {
    const calls = await db.query(`
      select 
        c.id,
        c.started_at,
        c.ended_at,
        c.duration_sec,
        c.disposition,
        c.recording_url,
        c.campaign,
        c.direction,
        ag.name as agent_name,
        an.reason_primary,
        an.qa_score,
        an.summary,
        t.call_id as has_transcript,
        an.call_id as has_analysis
      from calls c
      left join contacts ct on ct.id = c.contact_id
      left join agents ag on ag.id = c.agent_id
      left join analyses an on an.call_id = c.id
      left join transcripts t on t.call_id = c.id
      where replace(ct.primary_phone, '-', '') = $1
         or replace(ct.primary_phone, ' ', '') = $1
         or ct.primary_phone = $1
         or ct.primary_phone = '+' || $1
         or ct.primary_phone = '+1' || $1
      order by c.started_at desc nulls last
    `, [normalizedPhone]);
    
    // Get summary stats
    const stats = {
      totalCalls: calls.rows.length,
      firstCall: calls.rows.length > 0 ? calls.rows[calls.rows.length - 1].started_at : null,
      lastCall: calls.rows.length > 0 ? calls.rows[0].started_at : null,
      totalDuration: calls.rows.reduce((sum, call) => sum + (call.duration_sec || 0), 0)
    };
    
    return NextResponse.json({
      phone: normalizedPhone,
      stats,
      calls: calls.rows
    });
  } catch (err: any) {
    console.error('Journey API error:', err);
    return NextResponse.json({ error: 'Failed to fetch journey' }, { status: 500 });
  }
}