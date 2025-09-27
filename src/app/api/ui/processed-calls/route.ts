import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation, createSecureClient } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  try {
    const supabase = createSecureClient();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: callsData, error } = await supabase
      .from('calls')
      .select(`
        id,
        source,
        campaign,
        disposition,
        direction,
        started_at,
        duration_sec,
        recording_url,
        agent_name,
        phone_number,
        agency_id,
        transcripts(text, lang, engine, call_id),
        analyses(summary, qa_score, script_adherence, sentiment_agent, sentiment_customer, reason_primary, risk_flags, key_quotes, call_id)
      `)
      .in('agency_id', context.agencyIds)
      .gte('started_at', thirtyDaysAgo)
      .order('started_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[SECURITY] Error fetching processed calls:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch calls' },
        { status: 500 }
      );
    }

    const filteredCalls = callsData?.filter(call =>
      call.transcripts || call.analyses
    ) || [];

    const calls = filteredCalls.map((row: any) => ({
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
      processing_status: row.analyses
        ? 'analyzed'
        : row.transcripts
        ? 'transcribed'
        : 'pending',
      transcript: row.transcripts ? {
        text: row.transcripts.text,
        lang: row.transcripts.lang,
        engine: row.transcripts.engine
      } : null,
      analysis: row.analyses ? {
        summary: row.analyses.summary,
        qa_score: row.analyses.qa_score,
        script_adherence: row.analyses.script_adherence,
        sentiment_agent: row.analyses.sentiment_agent,
        sentiment_customer: row.analyses.sentiment_customer,
        reason_primary: row.analyses.reason_primary,
        risk_flags: row.analyses.risk_flags,
        key_quotes: row.analyses.key_quotes
      } : null
    }));

    return NextResponse.json({
      ok: true,
      data: calls,
      total: calls.length
    });

  } catch (error: any) {
    console.error('[SECURITY] Error fetching processed calls:', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
});