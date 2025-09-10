import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { PAGINATION, createPaginatedResponse } from '@/src/lib/pagination';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { q, limit = PAGINATION.DEFAULT_LIMIT, offset = PAGINATION.DEFAULT_OFFSET } = body;
    
    // Validate pagination params
    const validatedLimit = Math.min(Math.max(1, limit), PAGINATION.MAX_LIMIT);
    const validatedOffset = Math.min(Math.max(0, offset), PAGINATION.MAX_OFFSET);
    
    if (!q) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }
    
    const er = await fetch('https://api.openai.com/v1/embeddings', {
      method:'POST',
      headers:{ 'Authorization': `Bearer ${process.env.OPENAI_API_KEY!}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: q })
    });
    const ej = await er.json();
    const v = ej.data[0].embedding;

    // Get total count (approximate for performance - vector search doesn't need exact count)
    const countResult = await db.query(`
      select count(*) as total
      from transcript_embeddings e
    `);
    const total = parseInt(countResult.rows[0].total, 10);

    // Get paginated results
    const { rows } = await db.query(`
      select c.id, c.started_at, ag.name agent, an.reason_primary, 1 - (embedding <=> $1) as score
      from transcript_embeddings e
      join calls c on c.id=e.call_id
      left join agents ag on ag.id=c.agent_id
      left join analyses an on an.call_id=c.id
      order by e.embedding <=> $1
      limit $2 offset $3
    `, [v, validatedLimit, validatedOffset]);
    
    const response = createPaginatedResponse(rows, total, validatedLimit, validatedOffset);
    return NextResponse.json({ ...response, query: q });
  } catch (err: any) {
    console.error('ui/search POST error', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
