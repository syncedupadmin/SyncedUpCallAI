import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Get best calls (successful dispositions, longer duration)
    const best = await db.manyOrNone(`
      SELECT 
        c.id,
        c.started_at,
        c.duration_sec,
        c.disposition,
        c.campaign,
        COALESCE(c.agent_name, ag.name) as agent,
        an.qa_score,
        an.reason_primary,
        an.reason_secondary,
        an.summary,
        an.risk_flags
      FROM calls c
      LEFT JOIN agents ag ON ag.id = c.agent_id
      LEFT JOIN analyses an ON an.call_id = c.id
      WHERE c.disposition IN ('Completed', 'Success', 'Connected', 'Answered')
        AND c.duration_sec > 60
      ORDER BY 
        an.qa_score DESC NULLS LAST,
        c.duration_sec DESC,
        c.started_at DESC
      LIMIT 20
    `);
    
    // Get worst calls (failed dispositions, short duration)
    const worst = await db.manyOrNone(`
      SELECT 
        c.id,
        c.started_at,
        c.duration_sec,
        c.disposition,
        c.campaign,
        COALESCE(c.agent_name, ag.name) as agent,
        an.qa_score,
        an.reason_primary,
        an.reason_secondary,
        an.summary,
        an.risk_flags
      FROM calls c
      LEFT JOIN agents ag ON ag.id = c.agent_id
      LEFT JOIN analyses an ON an.call_id = c.id
      WHERE c.disposition IN ('Failed', 'No Answer', 'Busy', 'Voicemail', 'Disconnected', 'Rejected')
        OR c.duration_sec < 30
      ORDER BY 
        an.qa_score ASC NULLS LAST,
        c.duration_sec ASC,
        c.started_at DESC
      LIMIT 20
    `);
    
    // Get recent calls
    const recent = await db.manyOrNone(`
      SELECT 
        c.id,
        c.started_at,
        c.duration_sec,
        c.disposition,
        c.campaign,
        COALESCE(c.agent_name, ag.name) as agent,
        an.qa_score,
        an.reason_primary,
        an.reason_secondary,
        an.summary,
        an.risk_flags
      FROM calls c
      LEFT JOIN agents ag ON ag.id = c.agent_id
      LEFT JOIN analyses an ON an.call_id = c.id
      WHERE c.started_at >= NOW() - INTERVAL '7 days'
      ORDER BY c.started_at DESC
      LIMIT 20
    `);
    
    // Calculate average QA score from analyzed calls
    const avgScoreResult = await db.oneOrNone(`
      SELECT AVG(qa_score) as avg_score
      FROM analyses
      WHERE qa_score IS NOT NULL
    `);
    
    return NextResponse.json({ 
      ok: true, 
      best: best || [],
      worst: worst || [],
      recent: recent || [],
      avgScore: avgScoreResult?.avg_score ? parseFloat(avgScoreResult.avg_score) : null
    });
    
  } catch (err: any) {
    console.error('ui/library/simple GET error', err);
    
    // Return empty arrays on error
    return NextResponse.json({ 
      ok: true,
      best: [],
      worst: [],
      recent: [],
      avgScore: null
    });
  }
}