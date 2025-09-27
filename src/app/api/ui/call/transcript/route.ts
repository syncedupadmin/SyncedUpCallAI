import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient, validateResourceAccess } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  const id = req.nextUrl.searchParams.get('id');
  const format = req.nextUrl.searchParams.get('format') || 'json';

  if (!id) {
    return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 });
  }

  try {
    const supabase = createSecureClient();

    // SECURITY: Validate user has access to this call
    const hasAccess = await validateResourceAccess(id, 'calls', context);

    if (!hasAccess) {
      console.error(`[SECURITY] User ${context.userId} attempted to access transcript ${id} without permission`);
      return NextResponse.json({
        ok: false,
        error: 'transcript_not_found'
      }, { status: 404 });
    }

    // Get transcript with call metadata using RLS-enabled client
    const { data: transcript, error: transcriptError } = await supabase
      .from('transcripts')
      .select(`
        *,
        calls!inner(
          started_at,
          duration_sec,
          agent_name,
          agency_id,
          contacts(primary_phone)
        )
      `)
      .eq('call_id', id)
      .in('calls.agency_id', context.agencyIds)
      .single();

    if (transcriptError || !transcript) {
      return NextResponse.json({
        ok: false,
        error: 'transcript_not_found'
      }, { status: 404 });
    }

    // Parse diarized segments if available
    let segments = [];
    if (transcript.diarized) {
      try {
        segments = typeof transcript.diarized === 'string'
          ? JSON.parse(transcript.diarized)
          : transcript.diarized;
      } catch {}
    }

    if (format === 'txt') {
      // Generate text format with speaker labels
      let content = `CALL TRANSCRIPT\n`;
      content += `================\n`;
      content += `Call ID: ${id}\n`;
      content += `Date: ${transcript.calls?.started_at ? new Date(transcript.calls.started_at).toLocaleString() : 'Unknown'}\n`;
      content += `Duration: ${transcript.calls?.duration_sec ? `${Math.floor(transcript.calls.duration_sec / 60)}:${(transcript.calls.duration_sec % 60).toString().padStart(2, '0')}` : 'Unknown'}\n`;
      content += `Language: ${transcript.lang || 'en'}\n`;
      content += `Engine: ${transcript.engine || 'Unknown'}\n`;
      content += `\n================\n\n`;

      if (segments.length > 0) {
        segments.forEach((seg: any) => {
          const speaker = seg.speaker || `Speaker ${seg.speaker_id || 'Unknown'}`;
          const time = seg.start ? `[${Math.floor(seg.start / 60)}:${(seg.start % 60).toFixed(0).padStart(2, '0')}]` : '';
          content += `${speaker} ${time}:\n${seg.text || seg.transcript || ''}\n\n`;
        });
      } else {
        content += transcript.translated_text || transcript.text || 'No transcript available';
      }

      return new Response(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `inline; filename="transcript_${id}.txt"`,
        },
      });
    }

    // JSON format
    return NextResponse.json({
      ok: true,
      call_id: id,
      lang: transcript.lang,
      engine: transcript.engine,
      text: transcript.text,
      translated_text: transcript.translated_text,
      segments,
      words: transcript.words ? (typeof transcript.words === 'string' ? JSON.parse(transcript.words) : transcript.words) : [],
      metadata: {
        started_at: transcript.calls?.started_at,
        duration_sec: transcript.calls?.duration_sec,
        agent_name: transcript.calls?.agent_name,
        customer_phone: transcript.calls?.contacts?.primary_phone,
      }
    });
  } catch (error: any) {
    console.error('[SECURITY] Error fetching transcript for user', context.userId, ':', error);
    return NextResponse.json({
      ok: false,
      error: 'server_error'
    }, { status: 500 });
  }
});