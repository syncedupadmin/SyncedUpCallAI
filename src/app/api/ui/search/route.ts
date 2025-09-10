import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { q } = await req.json();
  const er = await fetch('https://api.openai.com/v1/embeddings', {
    method:'POST',
    headers:{ 'Authorization': `Bearer ${process.env.OPENAI_API_KEY!}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: q })
  });
  const ej = await er.json();
  const v = ej.data[0].embedding;

  const { rows } = await db.query(`
    select c.id, c.started_at, ag.name agent, an.reason_primary, 1 - (embedding <=> $1) as score
    from transcript_embeddings e
    join calls c on c.id=e.call_id
    left join agents ag on ag.id=c.agent_id
    left join analyses an on an.call_id=c.id
    order by e.embedding <=> $1
    limit 50
  `, [v]);
  return NextResponse.json({ results: rows });
}
