import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { ConvosoV1 } from '@/server/lib/validation';
import { idemKey, asIso } from '@/server/lib/util';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (req.headers.get('x-webhook-secret') !== process.env.CONVOSO_WEBHOOK_SECRET)
    return NextResponse.json({ ok: false }, { status: 401 });

  const raw = await req.json();
  let p: any;
  try { p = ConvosoV1.parse(raw); } catch {
    await db.none(`insert into call_events(type,payload) values('quarantine',$1)`, [raw]);
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 422 });
  }

  const contact = await db.one(`
    insert into contacts(primary_phone) values($1)
    on conflict(primary_phone) do update set updated_at=now()
    returning id
  `, [p.customer_phone]);

  let agentId: string|null = null;
  if (p.agent_id) {
    const a = await db.one(`
      insert into agents(ext_ref,name) values($1,$2)
      on conflict(ext_ref) do update set name=excluded.name
      returning id
    `, [p.agent_id, p.agent_name||null]);
    agentId = a.id;
  }

  const agencyId = req.headers.get('x-agency-id') || null;
  const key = idemKey('convoso', p.lead_id, p.ended_at||null);

  const call = await db.one(`
    insert into calls (idem_key, source, source_ref, contact_id, agent_id, campaign, direction,
                       started_at, ended_at, duration_sec, recording_url, disposition, sale_time, agency_id)
    values ($1,'convoso',$2,$3,$4,$5,$6,$7,$8,extract(epoch from ($8::timestamptz - $7::timestamptz))::int,$9,$10,$11,$12)
    on conflict (idem_key) do update set
      disposition = excluded.disposition,
      ended_at = excluded.ended_at,
      duration_sec = excluded.duration_sec,
      recording_url = coalesce(excluded.recording_url, calls.recording_url),
      agency_id = excluded.agency_id
    returning id
  `, [key, p.lead_id, contact.id, agentId, p.campaign||null, p.direction||null, asIso(p.started_at), asIso(p.ended_at), p.recording_url||null, p.disposition||null, asIso(p.sale_time), agencyId]);

  await db.none(`insert into call_events(call_id,type,payload) values($1,'created',$2)`, [call.id, raw]);

  return NextResponse.json({ ok: true, callId: call.id });
}
