import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { rows } = await db.query(`
    select id, type, at, payload
    from call_events
    where type in ('quarantine','created')
    order by id desc
    limit 20
  `);
  return NextResponse.json({ rows });
}