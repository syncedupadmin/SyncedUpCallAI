import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const callId = searchParams.get('id');
  const format = searchParams.get('format') || 'txt';

  if (!callId) {
    return NextResponse.json({ error: 'Call ID required' }, { status: 400 });
  }

  try {
    // Get call details and transcript
    const call = await db.oneOrNone(`
      select 
        c.id,
        c.started_at,
        c.duration_sec,
        ct.primary_phone as customer_phone,
        ag.name as agent_name,
        t.text,
        t.translated_text,
        t.lang,
        t.diarized,
        t.engine
      from calls c
      left join contacts ct on ct.id = c.contact_id
      left join agents ag on ag.id = c.agent_id
      left join transcripts t on t.call_id = c.id
      where c.id = $1
    `, [callId]);

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (!call.text) {
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
    content += `Agent: ${call.agent_name || 'Unknown'}\n`;
    content += `Customer: ${call.customer_phone || 'Unknown'}\n`;
    content += `Language: ${call.lang || 'en'}\n`;
    content += `Transcription Engine: ${call.engine || 'Unknown'}\n`;
    content += `\n${'='.repeat(50)}\n\n`;

    // Transcript content
    if (call.diarized) {
      try {
        const diarized = JSON.parse(call.diarized);
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
          content += call.translated_text || call.text;
        }
      } catch {
        // If diarized parsing fails, use plain text
        content += call.translated_text || call.text;
      }
    } else {
      // Plain text without diarization
      content += call.translated_text || call.text;
    }

    // Add footer
    content += `\n${'='.repeat(50)}\n`;
    content += `End of Transcript\n`;
    content += `Exported: ${new Date().toLocaleString()}\n`;

    // Return as downloadable file
    const filename = `transcript_${callId.substring(0, 8)}_${Date.now()}.txt`;
    
    return new Response(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(new TextEncoder().encode(content).length),
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}