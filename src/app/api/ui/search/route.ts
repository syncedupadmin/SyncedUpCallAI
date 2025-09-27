import { NextRequest, NextResponse } from 'next/server';
import { withStrictAgencyIsolation } from '@/lib/security/agency-isolation';
import { db } from '@/server/db';
import { PAGINATION, createPaginatedResponse } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  return NextResponse.json({
    ok: true,
    data: [],
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false
  });
});

export const POST = withStrictAgencyIsolation(async (req, context) => {
  try {
    const body = await req.json();
    const { q, limit = PAGINATION.DEFAULT_LIMIT, offset = PAGINATION.DEFAULT_OFFSET } = body;

    const validatedLimit = Math.min(Math.max(1, limit), PAGINATION.MAX_LIMIT);
    const validatedOffset = Math.min(Math.max(0, offset), PAGINATION.MAX_OFFSET);

    if (!q) {
      return NextResponse.json({ ok: false, error: 'missing_query' }, { status: 400 });
    }

    const er = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: q })
    });
    const ej = await er.json();
    const v = ej.data[0].embedding;

    const countResult = await db.query(`
      select count(*) as total
      from transcript_embeddings e
      join calls c on c.id = e.call_id
      where c.agency_id = ANY($1)
    `, [context.agencyIds]);
    const total = parseInt(countResult.rows[0].total, 10);

    const { rows } = await db.query(`
      select
        c.id,
        c.started_at,
        c.duration_sec,
        c.disposition,
        ag.name as agent,
        an.reason_primary,
        an.qa_score,
        an.script_adherence,
        an.summary,
        t.lang,
        1 - (e.embedding <=> $1) as score
      from transcript_embeddings e
      join calls c on c.id = e.call_id
      join transcripts t on t.call_id = c.id
      left join agents ag on ag.id = c.agent_id
      left join analyses an on an.call_id = c.id
      where c.agency_id = ANY($4)
      order by e.embedding <=> $1
      limit $2 offset $3
    `, [v, validatedLimit, validatedOffset, context.agencyIds]);

    const response = createPaginatedResponse(rows, total, validatedLimit, validatedOffset);
    return NextResponse.json({ ok: true, ...response, query: q });
  } catch (err: any) {
    console.error('[SECURITY] ui/search POST error', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
});