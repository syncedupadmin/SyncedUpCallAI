import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    // Get comprehensive call details with all related data
    const call = await db.oneOrNone(`
      select 
        c.*,
        ct.primary_phone as customer_phone,
        ag.name as agent_name,
        ag.team as agent_team
      from calls c
      left join contacts ct on ct.id = c.contact_id
      left join agents ag on ag.id = c.agent_id
      where c.id = $1
    `, [id]);

    if (!call) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    const transcript = await db.oneOrNone(`
      select 
        call_id,
        engine,
        lang,
        text,
        translated_text,
        redacted,
        diarized,
        words,
        created_at
      from transcripts
      where call_id = $1
    `, [id]);

    const analysis = await db.oneOrNone(`
      select 
        call_id,
        reason_primary,
        reason_secondary,
        confidence,
        qa_score,
        script_adherence,
        sentiment_agent,
        sentiment_customer,
        risk_flags,
        actions,
        key_quotes,
        summary,
        model,
        token_input,
        token_output,
        created_at
      from analyses
      where call_id = $1
    `, [id]);

    const eventsResult = await db.query(`
      select id, type, payload, at
      from call_events
      where call_id = $1
      order by at desc
      limit 50
    `, [id]);
    const events = eventsResult.rows;
    
    // Check embedding status (check both table names for compatibility)
    let embedding = null;
    try {
      embedding = await db.oneOrNone(`
        select created_at 
        from embeddings 
        where call_id = $1
      `, [id]);
    } catch (e) {
      // Table might not exist or be named differently
      embedding = null;
    }

    return NextResponse.json({ 
      ok: true, 
      call, 
      transcript, 
      analysis, 
      events,
      has_embedding: !!embedding
    });
  } catch (err: any) {
    console.error('ui/call/[id] GET error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}