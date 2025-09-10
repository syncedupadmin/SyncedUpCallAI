import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.JOBS_SECRET}`)
    return NextResponse.json({ ok: false }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    // Default for cron calls (no body)
    body = { kind: 'all', limit: 50 };
  }

  const { kind = 'all', limit = 50 } = body;
  const safeLimit = Math.min(Math.max(1, limit), 100);

  let scanned = 0;
  let processed = 0;
  let skipped = 0;

  try {
    // Backfill transcripts
    if (kind === 'transcripts' || kind === 'all') {
      const missingTranscripts = await db.query(`
        select c.id, c.recording_url, c.duration_sec
        from calls c
        left join transcripts t on t.call_id = c.id
        where c.duration_sec >= 10
          and c.recording_url is not null
          and t.call_id is null
          and c.started_at > now() - interval '30 days'
        order by c.started_at desc
        limit $1
      `, [safeLimit]);

      scanned += missingTranscripts.rows.length;

      for (const call of missingTranscripts.rows) {
        try {
          const resp = await fetch(`${process.env.APP_URL}/api/jobs/transcribe`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${process.env.JOBS_SECRET}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              callId: call.id, 
              recordingUrl: call.recording_url 
            })
          });

          if (resp.ok) {
            processed++;
          } else {
            const error = await resp.json();
            console.log(`Backfill transcript failed for ${call.id}:`, error);
            skipped++;
          }
        } catch (err) {
          console.error(`Backfill transcript error for ${call.id}:`, err);
          skipped++;
        }
      }
    }

    // Backfill analyses
    if (kind === 'analyses' || kind === 'all') {
      const missingAnalyses = await db.query(`
        select c.id, c.duration_sec
        from calls c
        join transcripts t on t.call_id = c.id
        left join analyses a on a.call_id = c.id
        where c.duration_sec >= 10
          and a.call_id is null
          and c.started_at > now() - interval '30 days'
        order by c.started_at desc
        limit $1
      `, [safeLimit]);

      scanned += missingAnalyses.rows.length;

      for (const call of missingAnalyses.rows) {
        try {
          const resp = await fetch(`${process.env.APP_URL}/api/jobs/analyze`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${process.env.JOBS_SECRET}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ callId: call.id })
          });

          if (resp.ok) {
            processed++;
          } else {
            const error = await resp.json();
            console.log(`Backfill analysis failed for ${call.id}:`, error);
            skipped++;
          }
        } catch (err) {
          console.error(`Backfill analysis error for ${call.id}:`, err);
          skipped++;
        }
      }
    }

    await db.none(`
      insert into call_events(type, payload) 
      values('backfill_completed', $1)
    `, [{ kind, scanned, processed, skipped }]);

    return NextResponse.json({ 
      ok: true, 
      scanned, 
      processed, 
      skipped 
    });
  } catch (err: any) {
    console.error('Backfill error:', err);
    return NextResponse.json({ 
      ok: false, 
      error: err.message 
    }, { status: 500 });
  }
}