import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { ANALYSIS_SCHEMA, validateAnalysis } from '@/src/server/lib/json-guard';
import { ANALYSIS_SYSTEM, userPrompt } from '@/src/server/lib/prompts';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.JOBS_SECRET}`)
    return NextResponse.json({ ok: false }, { status: 401 });

  const { callId } = await req.json();
  const row = await db.oneOrNone(`
    select c.*, t.text, t.redacted from calls c join transcripts t on t.call_id=c.id where c.id=$1
  `, [callId]);
  if (!row) return NextResponse.json({ ok: false, error: 'no_transcript' }, { status: 404 });

  const meta = {
    agent_id: row.agent_id, campaign: row.campaign, direction: row.direction,
    disposition: row.disposition, duration_sec: row.duration_sec, sale_time: row.sale_time
  };

  // OpenAI primary
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Authorization': `Bearer ${process.env.OPENAI_API_KEY!}`, 'Content-Type':'application/json' },
    body: JSON.stringify({
      model:'gpt-4o-mini',
      temperature:0.2,
      messages:[{ role:'system', content: ANALYSIS_SYSTEM }, { role:'user', content: userPrompt(meta, row.text) }],
      response_format:{ type:'json_object' }
    })
  });
  if (!r.ok) return NextResponse.json({ ok:false, error:'llm_unavailable' }, { status: 502 });
  const out = await r.json();
  let j: any; try { j = JSON.parse(out.choices[0].message.content); } catch { j = null; }
  if (!j || !validateAnalysis(j)) {
    await db.none(`insert into call_events(call_id,type,payload) values($1,'analysis_failed',$2)`, [callId, out]);
    return NextResponse.json({ ok:false, error:'schema_invalid' }, { status: 422 });
  }

  await db.none(`
    insert into analyses(call_id, reason_primary, reason_secondary, confidence, qa_score, script_adherence,
                         sentiment_agent, sentiment_customer, risk_flags, actions, key_quotes, summary, prompt_ver, model, token_input, token_output)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,2,$13,$14,$15)
    on conflict (call_id) do update set
      reason_primary=$2, reason_secondary=$3, confidence=$4, qa_score=$5, script_adherence=$6,
      sentiment_agent=$7, sentiment_customer=$8, risk_flags=$9, actions=$10, key_quotes=$11, summary=$12, model=$13
  `, [callId, j.reason_primary, (j as any).reason_secondary||null, j.confidence, j.qa_score, j.script_adherence,
      (j as any).sentiment_agent||null, (j as any).sentiment_customer||null, (j as any).risk_flags||[], (j as any).actions||[], JSON.stringify((j as any).key_quotes||[]), j.summary,
      'gpt-4o-mini', out.usage?.prompt_tokens||null, out.usage?.completion_tokens||null]);

  // Simple at-risk flag based on your rule
  const riskEasy = ((j.reason_primary === 'bank_decline' || j.reason_primary == 'trust_scam_fear' || j.reason_primary == 'spouse_approval') && (j.qa_score || 0) < 60) && 1 || 0
  await db.none(`
    update analyses set risk_flags = coalesce(risk_flags,'{}') || case when $2=1 then '{at_risk_easy}'::text[] else '{}'::text[] end
    where call_id = $1
  `, [callId, riskEasy]);

  await db.none(`insert into call_events(call_id,type,payload) values($1,'analyzed',$2)`, [callId, j]);
  return NextResponse.json({ ok: true });
}
