import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient, validateResourceAccess } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

async function handler(
  _req: NextRequest,
  context: any,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSecureClient();
    const id = params.id;

    const hasAccess = await validateResourceAccess(id, 'calls', context);

    if (!hasAccess) {
      console.error(`[SECURITY] User ${context.userId} attempted to access call ${id} without permission`);
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    const { data: call, error: callError } = await supabase
      .from('calls')
      .select(`
        *,
        contacts(primary_phone),
        agents(name, team)
      `)
      .eq('id', id)
      .in('agency_id', context.agencyIds)
      .single();

    if (callError || !call) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    const { data: transcript } = await supabase
      .from('transcripts')
      .select(`
        call_id,
        engine,
        lang,
        text,
        translated_text,
        redacted,
        diarized,
        words,
        created_at
      `)
      .eq('call_id', id)
      .single();

    const { data: analysis } = await supabase
      .from('analyses')
      .select(`
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
      `)
      .eq('call_id', id)
      .single();

    const { data: eventsData } = await supabase
      .from('call_events')
      .select('id, type, payload, at')
      .eq('call_id', id)
      .order('at', { ascending: false })
      .limit(50);

    const events = eventsData || [];

    let embedding = null;
    try {
      const { data: embeddingData } = await supabase
        .from('transcript_embeddings')
        .select('call_id')
        .eq('call_id', id)
        .single();
      embedding = embeddingData;
    } catch (e) {
      embedding = null;
    }

    // Fetch v2 analysis data
    const { data: openingSegment } = await supabase
      .from('opening_segments')
      .select('*')
      .eq('call_id', id)
      .single();

    const { data: postCloseCompliance } = await supabase
      .from('post_close_compliance')
      .select('*')
      .eq('call_id', id)
      .single();

    // Extract v2 metadata from calls.metadata
    let v2Metadata = null;
    if (call.metadata && call.metadata.v2_analysis) {
      v2Metadata = call.metadata.v2_analysis;
    }

    const transformedCall = {
      ...call,
      customer_phone: call.contacts?.primary_phone || null,
      agent_name: call.agents?.name || null,
      agent_team: call.agents?.team || null
    };

    delete transformedCall.contacts;
    delete transformedCall.agents;

    return NextResponse.json({
      ok: true,
      call: transformedCall,
      transcript,
      analysis,
      events,
      has_embedding: !!embedding,
      // v2 analysis data
      opening_segment: openingSegment || null,
      post_close_compliance: postCloseCompliance || null,
      v2_metadata: v2Metadata
    });
  } catch (err: any) {
    console.error('[SECURITY] ui/call/[id] GET error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

export const GET = withStrictAgencyIsolation(handler);