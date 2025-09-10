import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const format = req.nextUrl.searchParams.get('format') || 'json';
  
  if (!id) {
    return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 });
  }

  try {
    // Get transcript with call metadata
    const result = await db.oneOrNone(`
      SELECT 
        t.*,
        c.started_at,
        c.duration_sec,
        c.agent_name,
        c.customer_phone
      FROM transcripts t
      JOIN calls c ON c.id = t.call_id
      WHERE t.call_id = $1
    `, [id]);

    if (!result) {
      return NextResponse.json({ ok: false, error: 'transcript_not_found' }, { status: 404 });
    }

    // Parse diarized segments if available
    let segments = [];
    if (result.diarized) {
      try {
        segments = JSON.parse(result.diarized);
      } catch {}
    }

    if (format === 'txt') {
      // Generate text format with speaker labels
      let content = `CALL TRANSCRIPT\n`;
      content += `================\n`;
      content += `Call ID: ${id}\n`;
      content += `Date: ${result.started_at ? new Date(result.started_at).toLocaleString() : 'Unknown'}\n`;
      content += `Duration: ${result.duration_sec ? `${Math.floor(result.duration_sec / 60)}:${(result.duration_sec % 60).toString().padStart(2, '0')}` : 'Unknown'}\n`;
      content += `Language: ${result.lang || 'en'}\n`;
      content += `Engine: ${result.engine || 'Unknown'}\n`;
      content += `\n================\n\n`;

      if (segments.length > 0) {
        // Format with speaker labels
        segments.forEach((seg: any) => {
          const speaker = seg.speaker || `Speaker ${seg.speaker_id || 'Unknown'}`;
          const time = seg.start ? `[${Math.floor(seg.start / 60)}:${(seg.start % 60).toFixed(0).padStart(2, '0')}]` : '';
          content += `${speaker} ${time}:\n${seg.text || seg.transcript || ''}\n\n`;
        });
      } else {
        // Plain text
        content += result.translated_text || result.text || 'No transcript available';
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
      lang: result.lang,
      engine: result.engine,
      text: result.text,
      translated_text: result.translated_text,
      segments,
      words: result.words ? JSON.parse(result.words) : [],
      metadata: {
        started_at: result.started_at,
        duration_sec: result.duration_sec,
        agent_name: result.agent_name,
        customer_phone: result.customer_phone,
      }
    });
  } catch (error: any) {
    console.error('Error fetching transcript:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message 
    }, { status: 500 });
  }
}