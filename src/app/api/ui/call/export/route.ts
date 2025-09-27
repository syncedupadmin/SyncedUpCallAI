import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient, validateResourceAccess } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context): Promise<NextResponse> => {
  const searchParams = req.nextUrl.searchParams;
  const callId = searchParams.get('id');
  const format = searchParams.get('format') || 'txt';

  if (!callId) {
    return NextResponse.json({ error: 'Call ID required' }, { status: 400 });
  }

  try {
    const supabase = createSecureClient();

    // SECURITY: Validate user has access to this call
    const hasAccess = await validateResourceAccess(callId, 'calls', context);

    if (!hasAccess) {
      console.error(`[SECURITY] User ${context.userId} attempted to export call ${callId} without permission`);
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // Get call details and transcript using RLS-enabled client
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select(`
        id,
        started_at,
        duration_sec,
        agency_id,
        agent_name,
        agents(name),
        contacts(primary_phone),
        transcripts(
          text,
          translated_text,
          lang,
          diarized,
          engine
        )
      `)
      .eq('id', callId)
      .in('agency_id', context.agencyIds)
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const transcript = call.transcripts?.[0];

    if (!transcript?.text) {
      return NextResponse.json({ error: 'No transcript available' }, { status: 404 });
    }

    // Format transcript for export
    let content = '';
    const date = call.started_at ? new Date(call.started_at).toLocaleString() : 'Unknown date';

    // Header
    content += `Call Transcript\n`;
    content += `${'='.repeat(50)}\n\n`;
    content += `Date: ${date}\n`;
    content += `Duration: ${call.duration_sec ? `${Math.floor(call.duration_sec / 60)}m ${call.duration_sec % 60}s` : 'Unknown'}\n`;
    content += `Agent: ${call.agent_name || (call.agents as any)?.name || 'Unknown'}\n`;
    content += `Customer: ${(call.contacts as any)?.primary_phone || 'Unknown'}\n`;
    content += `Language: ${transcript.lang || 'en'}\n`;
    content += `Transcription Engine: ${transcript.engine || 'Unknown'}\n`;
    content += `\n${'='.repeat(50)}\n\n`;

    // Transcript content
    if (transcript.diarized) {
      try {
        const diarized = typeof transcript.diarized === 'string'
          ? JSON.parse(transcript.diarized)
          : transcript.diarized;

        if (Array.isArray(diarized) && diarized.length > 0) {
          content += `TRANSCRIPT WITH SPEAKER LABELS\n\n`;

          for (const segment of diarized) {
            const speaker = segment.speaker || `Speaker ${segment.speaker_id || 'Unknown'}`;
            const timestamp = segment.start ?
              `[${Math.floor(segment.start / 60)}:${String(Math.floor(segment.start % 60)).padStart(2, '0')}]` :
              '';
            const text = segment.text || segment.transcript || '';

            content += `${timestamp} ${speaker}:\n${text}\n\n`;
          }
        } else {
          // Fallback to plain text
          content += transcript.translated_text || transcript.text;
        }
      } catch {
        // If diarized parsing fails, use plain text
        content += transcript.translated_text || transcript.text;
      }
    } else {
      // Plain text without diarization
      content += transcript.translated_text || transcript.text;
    }

    // Add footer
    content += `\n${'='.repeat(50)}\n`;
    content += `End of Transcript\n`;
    content += `Exported: ${new Date().toLocaleString()}\n`;

    // Return as downloadable file
    const filename = `transcript_${callId.substring(0, 8)}_${Date.now()}.txt`;

    return NextResponse.json(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(new TextEncoder().encode(content).length),
      },
    }) as any as NextResponse;
  } catch (error: any) {
    console.error('[SECURITY] Export error for user', context.userId, ':', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
});