import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

interface BackfillOptions {
  type: 'transcripts' | 'analyses' | 'embeddings' | 'rollups';
  startDate?: string;
  endDate?: string;
  limit?: number;
  force?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body: BackfillOptions = await req.json();
    const { type, startDate, endDate, limit = 100, force = false } = body;

    console.log(`[Backfill] Starting ${type} backfill`, { startDate, endDate, limit, force });

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const startTime = Date.now();

    switch (type) {
      case 'transcripts': {
        // Find calls without transcripts
        const dateFilter = startDate && endDate 
          ? `AND started_at BETWEEN $1 AND $2`
          : '';
        const params = startDate && endDate ? [startDate, endDate, limit] : [limit];
        
        const calls = await db.manyOrNone(`
          SELECT c.id, c.convoso_audio_url, c.started_at
          FROM calls c
          LEFT JOIN transcripts t ON t.call_id = c.id
          WHERE t.id IS NULL 
            AND c.convoso_audio_url IS NOT NULL
            ${dateFilter}
          ORDER BY c.started_at DESC
          LIMIT $${params.length}
        `, params);

        console.log(`[Backfill] Found ${calls.length} calls without transcripts`);

        for (const call of calls) {
          try {
            // Trigger transcript job
            const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/jobs/transcribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: call.id,
                audioUrl: call.convoso_audio_url,
                force
              })
            });

            if (response.ok) {
              processed++;
              console.log(`[Backfill] Queued transcript for ${call.id}`);
            } else {
              errors++;
              console.error(`[Backfill] Failed to queue transcript for ${call.id}`);
            }

            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            errors++;
            console.error(`[Backfill] Error processing ${call.id}:`, error);
          }
        }
        break;
      }

      case 'analyses': {
        // Find transcripts without analyses
        const dateFilter = startDate && endDate 
          ? `AND c.started_at BETWEEN $1 AND $2`
          : '';
        const params = startDate && endDate ? [startDate, endDate, limit] : [limit];
        
        const transcripts = await db.manyOrNone(`
          SELECT t.call_id, t.text, c.started_at
          FROM transcripts t
          JOIN calls c ON c.id = t.call_id
          LEFT JOIN analyses a ON a.call_id = t.call_id
          WHERE a.id IS NULL 
            AND t.text IS NOT NULL
            ${dateFilter}
          ORDER BY c.started_at DESC
          LIMIT $${params.length}
        `, params);

        console.log(`[Backfill] Found ${transcripts.length} transcripts without analyses`);

        for (const transcript of transcripts) {
          try {
            // Trigger analysis job
            const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/jobs/analyze`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: transcript.call_id,
                force
              })
            });

            if (response.ok) {
              processed++;
              console.log(`[Backfill] Queued analysis for ${transcript.call_id}`);
            } else {
              errors++;
              console.error(`[Backfill] Failed to queue analysis for ${transcript.call_id}`);
            }

            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            errors++;
            console.error(`[Backfill] Error processing ${transcript.call_id}:`, error);
          }
        }
        break;
      }

      case 'embeddings': {
        // Find transcripts without embeddings
        const dateFilter = startDate && endDate 
          ? `AND c.started_at BETWEEN $1 AND $2`
          : '';
        const params = startDate && endDate ? [startDate, endDate, limit] : [limit];
        
        const transcripts = await db.manyOrNone(`
          SELECT t.call_id, t.text, c.started_at
          FROM transcripts t
          JOIN calls c ON c.id = t.call_id
          LEFT JOIN transcript_embeddings e ON e.call_id = t.call_id
          WHERE e.id IS NULL 
            AND t.text IS NOT NULL
            ${dateFilter}
          ORDER BY c.started_at DESC
          LIMIT $${params.length}
        `, params);

        console.log(`[Backfill] Found ${transcripts.length} transcripts without embeddings`);

        for (const transcript of transcripts) {
          try {
            // Generate embedding
            const { ensureEmbedding } = await import('@/src/server/embeddings');
            await ensureEmbedding(transcript.call_id);
            
            processed++;
            console.log(`[Backfill] Generated embedding for ${transcript.call_id}`);

            // Rate limit for OpenAI
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            errors++;
            console.error(`[Backfill] Error generating embedding for ${transcript.call_id}:`, error);
          }
        }
        break;
      }

      case 'rollups': {
        // Generate rollups for date range
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const dates = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dates.push(new Date(d).toISOString().split('T')[0]);
        }

        console.log(`[Backfill] Generating rollups for ${dates.length} days`);

        for (const date of dates) {
          try {
            await db.none(`SELECT generate_daily_rollup($1::date)`, [date]);
            processed++;
            console.log(`[Backfill] Generated rollup for ${date}`);
          } catch (error) {
            errors++;
            console.error(`[Backfill] Error generating rollup for ${date}:`, error);
          }
        }
        break;
      }

      default:
        return NextResponse.json({
          ok: false,
          error: `Invalid backfill type: ${type}`
        }, { status: 400 });
    }

    const duration = Date.now() - startTime;

    // Log backfill completion
    await db.none(`
      INSERT INTO call_events(call_id, type, payload)
      VALUES('SYSTEM', 'backfill_completed', $1)
    `, [{
      type,
      processed,
      skipped,
      errors,
      duration_ms: duration,
      options: body
    }]);

    return NextResponse.json({
      ok: true,
      type,
      processed,
      skipped,
      errors,
      duration_ms: duration
    });

  } catch (error: any) {
    console.error('[Backfill] Error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Backfill failed'
    }, { status: 500 });
  }
}

// GET endpoint to check backfill status
export async function GET(req: NextRequest) {
  try {
    // Get recent backfill events
    const events = await db.manyOrNone(`
      SELECT payload, created_at
      FROM call_events
      WHERE call_id = 'SYSTEM' 
        AND type = 'backfill_completed'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // Get current gaps
    const gaps = await db.one(`
      SELECT 
        (SELECT COUNT(*) FROM calls c LEFT JOIN transcripts t ON t.call_id = c.id WHERE t.id IS NULL AND c.convoso_audio_url IS NOT NULL) as missing_transcripts,
        (SELECT COUNT(*) FROM transcripts t LEFT JOIN analyses a ON a.call_id = t.call_id WHERE a.id IS NULL AND t.text IS NOT NULL) as missing_analyses,
        (SELECT COUNT(*) FROM transcripts t LEFT JOIN transcript_embeddings e ON e.call_id = t.call_id WHERE e.id IS NULL AND t.text IS NOT NULL) as missing_embeddings,
        (SELECT COUNT(*) FROM (SELECT generate_series(CURRENT_DATE - interval '30 days', CURRENT_DATE, '1 day')::date as date) d LEFT JOIN revenue_rollups r ON r.date = d.date WHERE r.id IS NULL) as missing_rollups
    `);

    return NextResponse.json({
      ok: true,
      gaps,
      recent_backfills: events
    });

  } catch (error: any) {
    console.error('[Backfill] Status error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to get backfill status'
    }, { status: 500 });
  }
}