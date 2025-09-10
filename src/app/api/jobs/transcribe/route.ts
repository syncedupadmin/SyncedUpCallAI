import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { transcribe, translateToEnglish } from '@/src/server/asr';
import { ensureEmbedding } from '@/src/server/embeddings';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.JOBS_SECRET}`)
    return NextResponse.json({ ok: false }, { status: 401 });

  const { callId, recordingUrl } = await req.json();
  
  // Check if already transcribed
  const existing = await db.oneOrNone(`select call_id from transcripts where call_id=$1`, [callId]);
  if (existing) {
    await db.none(`insert into call_events(call_id, type, payload) values($1, 'transcribe_skipped', $2)`, 
      [callId, { reason: 'already_exists' }]);
    return NextResponse.json({ ok: true, skipped: 'exists' });
  }
  
  // Check if call is >= 10s
  const call = await db.oneOrNone(`select duration_sec from calls where id=$1`, [callId]);
  if (!call || (call.duration_sec && call.duration_sec < 10)) {
    await db.none(`insert into call_events(call_id, type, payload) values($1, 'short_call_skipped', $2)`, 
      [callId, { duration_sec: call?.duration_sec || 0 }]);
    return NextResponse.json({ ok: false, error: 'short_call' });
  }

  try {
    // Use new ASR service layer
    const result = await transcribe(recordingUrl);
    
    // Translate if needed
    let translatedText = result.translated_text;
    if (!translatedText && result.lang !== 'en') {
      translatedText = await translateToEnglish(result.text, result.lang);
    }
    
    // Store transcript with all metadata
    await db.none(`
      insert into transcripts(call_id, engine, lang, text, translated_text, redacted, diarized, words, created_at)
      values($1, $2, $3, $4, $5, $4, $6, $7, now())
      on conflict (call_id) do update set
        engine=$2, lang=$3, text=$4, translated_text=$5, redacted=$4, 
        diarized=$6, words=$7, created_at=now()
    `, [
      callId, 
      result.engine,
      result.lang,
      result.text,
      translatedText || result.text,
      JSON.stringify(result.diarized || []),
      JSON.stringify(result.words || [])
    ]);

    await db.none(`insert into call_events(call_id, type, payload) values($1, 'transcribed', $2)`, 
      [callId, { engine: result.engine, lang: result.lang, chars: result.text.length }]);

    // Generate embedding for search
    try {
      await ensureEmbedding(callId);
    } catch (embedError) {
      console.error('Embedding generation failed:', embedError);
      // Don't fail the whole request if embedding fails
    }

    // Trigger analysis
    await fetch(`${process.env.APP_URL}/api/jobs/analyze`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.JOBS_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId })
    });

    return NextResponse.json({ 
      ok: true, 
      engine: result.engine,
      lang: result.lang,
      saved: true
    });
  } catch (error: any) {
    await db.none(`insert into call_events(call_id, type, payload) values($1, 'transcribe_failed', $2)`, 
      [callId, { error: error.message }]);
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }
}
