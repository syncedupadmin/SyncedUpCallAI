import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.JOBS_SECRET}`)
    return NextResponse.json({ ok: false }, { status: 401 });

  const { callId, recordingUrl } = await req.json();

  async function deepgram() {
    const resp = await fetch('https://api.deepgram.com/v1/listen?punctuate=true&diarize=true&utterances=true&detect_language=true', {
      method: 'POST',
      headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: recordingUrl })
    });
    if (!resp.ok) throw new Error('deepgram_failed');
    const dg = await resp.json();
    const text = dg.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    const diarized = dg.results?.utterances ?? [];
    await db.none(`
      insert into transcripts(call_id, engine, text, redacted, diarized, words)
      values($1,'deepgram',$2,$2,$3,$4)
      on conflict (call_id) do update set text=$2, redacted=$2, diarized=$3, words=$4
    `, [callId, text, JSON.stringify(diarized), JSON.stringify(dg.results)]);
  }

  async function assembly() {
    const aai = await fetch('https://api.assemblyai.com/v2/transcribe', {
      method: 'POST',
      headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_url: recordingUrl, speaker_labels: true, punctuate: true, format_text: true })
    });
    if (!aai.ok) throw new Error('assemblyai_submit_failed');
    const job = await aai.json();
    // Poll quickly (batch job context)
    for (let i=0; i<40; i++) {
      await new Promise(r=>setTimeout(r, 3000));
      const poll = await fetch(`https://api.assemblyai.com/v2/transcribe/${job.id}`, {
        headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! }
      });
      const res = await poll.json();
      if (res.status === 'completed') {
        const text = res.text || '';
        const diarized = res.utterances || [];
        await db.none(`
          insert into transcripts(call_id, engine, text, redacted, diarized, words)
          values($1,'assemblyai',$2,$2,$3,$4)
          on conflict (call_id) do update set text=$2, redacted=$2, diarized=$3, words=$4
        `, [callId, text, JSON.stringify(diarized), JSON.stringify(res)]);
        return;
      }
      if (res.status === 'error') throw new Error('assemblyai_failed');
    }
    throw new Error('assemblyai_timeout');
  }

  try {
    await deepgram();
  } catch (e) {
    try { await assembly(); }
    catch (e2) { return NextResponse.json({ ok:false, error:String(e2) }, { status: 502 }); }
  }

  await db.none(`insert into call_events(call_id,type) values($1,'transcribed')`, [callId]);

  await fetch(`${process.env.APP_URL}/api/jobs/analyze`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.JOBS_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ callId })
  });

  return NextResponse.json({ ok: true });
}
