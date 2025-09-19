import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Fetch all calls with transcripts or analysis
    const result = await db.query(`
      SELECT
        c.id,
        c.source,
        c.campaign,
        c.disposition,
        c.direction,
        c.started_at,
        c.duration_sec,
        c.recording_url,
        c.agent_name,
        c.phone_number,
        t.text as transcript_text,
        t.lang as transcript_lang,
        t.engine as transcript_engine,
        a.summary as analysis_summary,
        a.qa_score,
        a.script_adherence,
        a.sentiment_agent,
        a.sentiment_customer,
        a.reason_primary,
        a.risk_flags,
        a.key_quotes,
        CASE
          WHEN a.call_id IS NOT NULL THEN 'analyzed'
          WHEN t.call_id IS NOT NULL THEN 'transcribed'
          ELSE 'pending'
        END as processing_status
      FROM calls c
      LEFT JOIN transcripts t ON t.call_id = c.id
      LEFT JOIN analyses a ON a.call_id = c.id
      WHERE (t.call_id IS NOT NULL OR a.call_id IS NOT NULL)
        AND c.started_at > NOW() - INTERVAL '30 days'
      ORDER BY c.started_at DESC
      LIMIT 500
    `);

    // Transform the data for the frontend
    const calls = result.rows.map(row => ({
      id: row.id,
      source: row.source,
      campaign: row.campaign,
      disposition: row.disposition,
      direction: row.direction,
      started_at: row.started_at,
      duration_sec: row.duration_sec,
      recording_url: row.recording_url,
      agent_name: row.agent_name,
      phone_number: row.phone_number,
      processing_status: row.processing_status,
      transcript: row.transcript_text ? {
        text: row.transcript_text,
        lang: row.transcript_lang,
        engine: row.transcript_engine
      } : null,
      analysis: row.analysis_summary ? {
        summary: row.analysis_summary,
        qa_score: row.qa_score,
        script_adherence: row.script_adherence,
        sentiment_agent: row.sentiment_agent,
        sentiment_customer: row.sentiment_customer,
        reason_primary: row.reason_primary,
        risk_flags: row.risk_flags,
        key_quotes: row.key_quotes
      } : null
    }));

    return NextResponse.json({
      ok: true,
      data: calls,
      total: calls.length
    });

  } catch (error: any) {
    console.error('Error fetching processed calls:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}