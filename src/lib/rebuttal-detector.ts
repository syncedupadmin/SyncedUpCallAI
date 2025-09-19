import { REBUTTALS, Rebuttal } from "./rebuttals-catalog";
import { embed, cosine, Emb } from "./semantic";
import type { Segment } from "./asr-nova2";

// Cheap customer "escape" detectors
const ESCAPES = [
  { type: "call_back",  rx: /(call\s+me\s+back|ll[aá]mame.*luego|tomorrow|later)/i },
  { type: "send_info",  rx: /(send|text|email).*info|m[aá]ndame.*informaci[oó]n/i },
  { type: "already_insured", rx: /(already.*(insured|covered)|tengo.*seguro)/i },
  { type: "spouse",     rx: /(talk.*(wife|husband|spouse|partner)|espos[oa])/i },
  { type: "not_interested", rx: /(not\s+interested|no\s+me\s+interesa)/i },
  { type: "too_good_to_be_true", rx: /(scam|too good|suena.*estafa)/i },
  { type: "time_delay", rx: /(another\s+day|another\s+time|otro\s+d[ií]a)/i },
];

type Match = { id: string; bucket: string; score: number; exemplarIdx: number };

function keywordScore(text: string, kws?: string[], negs?: string[]): number {
  const t = text.toLowerCase();
  let pos = 0, neg = 0;
  kws?.forEach(k => { if (t.includes(k.toLowerCase())) pos++; });
  negs?.forEach(n => { if (t.includes(n.toLowerCase())) neg++; });
  const denom = Math.max(1, (kws?.length || 1));
  return Math.max(0, (pos/denom) - (neg>0 ? 0.25 : 0));
}

export async function buildCatalogEmbeddings() {
  const ex = REBUTTALS.flatMap(r => r.exemplars.map(e => `[${r.id}] ${e}`));
  const embs = await embed(ex);
  // index by (rebuttalIndex, exemplarIndex)
  const idx: Emb[][] = [];
  let k = 0;
  for (let i=0;i<REBUTTALS.length;i++) {
    const m = REBUTTALS[i].exemplars.length;
    idx[i] = embs.slice(k, k+m);
    k += m;
  }
  return idx;
}

export async function matchRebuttal(
  text: string,
  catalogEmbs: Emb[][]
): Promise<Match | null> {
  const [textEmb] = await embed([text]);
  let best: Match | null = null;

  for (let i=0;i<REBUTTALS.length;i++) {
    const r: Rebuttal = REBUTTALS[i];
    for (let j=0;j<r.exemplars.length;j++) {
      const sim = cosine(textEmb, catalogEmbs[i][j]);
      const kw = keywordScore(text, r.keywords, r.negatives);
      // composite score: semantic 70%, keywords 30%
      const score = 0.7*sim + 0.3*kw;
      if (!best || score > best.score) best = { id: r.id, bucket: r.bucket, score, exemplarIdx: j };
    }
  }
  // Tight but practical thresholds:
  // >0.62 strong match; 0.55–0.62 if it also contains 1+ keyword
  if (best && (best.score >= 0.62 || (best.score >= 0.55))) return best;
  return null;
}

// Find customer escapes then see if agent fires a rebuttal within next 2 agent turns
export async function detectRebuttalsAndEscapes(segments: Segment[]) {
  const catalogEmbs = await buildCatalogEmbeddings();
  const escapes: any[] = [];
  const rebuttalsUsed: any[] = [];
  const rebuttalsMissed: any[] = [];

  // Build simple turn list
  const turns = segments.map((s, idx) => ({ idx, who: s.speaker, text: s.text, ts: s.startMs }));

  for (let i=0;i<turns.length;i++) {
    const t = turns[i];
    if (t.who !== "customer") continue;
    const esc = ESCAPES.find(e => e.rx.test(t.text));
    if (!esc) continue;
    escapes.push({ type: esc.type, ts: mmss(t.ts), quote_customer: t.text });

    // lookahead window: next 2 agent turns
    let agentTurns = 0;
    let matched = false;
    for (let j=i+1; j<Math.min(i+12, turns.length); j++) {
      const u = turns[j];
      if (u.who !== "agent") continue;
      agentTurns++;
      const m = await matchRebuttal(u.text, catalogEmbs);
      if (m) {
        rebuttalsUsed.push({
          id: m.id, bucket: m.bucket, ts: mmss(u.ts), quote_agent: u.text, score: Math.round(m.score*100)/100
        });
        matched = true;
        break;
      }
      if (agentTurns >= 2) break; // only first two agent responses count
    }
    if (!matched) rebuttalsMissed.push({ escape_type: esc.type, ts: mmss(t.ts) });
  }

  // Did the agent ask for the card after their final rebuttal?
  const lastRebuttal = rebuttalsUsed[rebuttalsUsed.length-1];
  const askedCard = lastRebuttal ? turns.slice(turns.findIndex(x=>mmss(x.ts)===lastRebuttal.ts))
    .some(x => x.who==="agent" && /visa|master\s*card|card number|tarjeta/i.test(x.text)) : false;

  return {
    escapes,
    rebuttalsUsed,
    rebuttalsMissed,
    summary: {
      total_used: rebuttalsUsed.length,
      total_missed: rebuttalsMissed.length,
      used_ids: rebuttalsUsed.map(r => r.id),
      missed_reasons: rebuttalsMissed.map(r => r.escape_type),
      asked_for_card_after_last_rebuttal: askedCard
    }
  };
}

function mmss(ms: number) {
  const s = Math.floor(ms/1000);
  const m = Math.floor(s/60);
  const sec = s%60;
  return `${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}`;
}