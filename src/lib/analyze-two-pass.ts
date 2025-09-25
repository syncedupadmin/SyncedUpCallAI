import OpenAI from "openai";

/**
 * Two-pass analyzer with context windows and early-exit routing.
 * Pass A: extractor (gpt-4o-mini) → mentions table
 * Pass B: arbiter (gpt-4o) → final white card JSON (only when needed)
 */

export type Mentions = {
  money_mentions: Array<{
    field_hint: "monthly_premium" | "first_month_bill" | "enrollment_fee" | "generic";
    value_raw: string;
    quote: string;
    position: number;
    speaker: "agent" | "customer" | "unknown";
  }>;
  plan_mentions: Array<{ plan_type: "PPO"|"HMO"|"EPO"|"POS"|"Medigap"|"ACA bronze"|"ACA silver"|"ACA gold"|"Short-term"|"Medicare Advantage"|"Open access"; quote:string; position:number }>;
  carrier_mentions: Array<{ carrier:string; quote:string; position:number }>;
  date_mentions: Array<{ kind:"effective_date"|"post_date"|"generic"; value_raw:string; quote:string; position:number }>;
  signals: { sale_cues:string[]; callback_cues:string[]; red_flags_raw:string[] };
};

export type WhiteCard = {
  outcome: "sale" | "no_sale" | "callback";
  monthly_premium: number | null;
  enrollment_fee: number | null;
  reason: string;
  summary: string;
  customer_name: string | null;
  policy_details: { carrier: string | null; plan_type: "PPO"|"HMO"|"EPO"|"POS"|"Medigap"|"ACA bronze"|"ACA silver"|"ACA gold"|"Short-term"|"Medicare Advantage"|"Open access"|null; effective_date: string | null };
  red_flags: string[];
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/** ---------- PASS A: extractor ---------- */
export async function extractMentions({ transcript, callMeta }: { transcript: string; callMeta: { call_started_at_iso: string; tz: string } }): Promise<Mentions> {
  const sys = await fetchFile("/prompts/passA_extractor.md");
  const schema = await fetchJSON("/prompts/mentions.schema.json");
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `CALL_META:\n${JSON.stringify(callMeta)}\n\nTRANSCRIPT:\n${transcript}` }
    ],
    response_format: { type: "json_schema", json_schema: { name: "Mentions", schema, strict: true } },
    max_tokens: 600,
    temperature: 0.1
  });
  return JSON.parse(resp.choices[0].message.content || "{}");
}

/** Build 8s context windows (4s before/after). If you don't have per-word timestamps, we simulate context by characters around the mention. */
export function buildContextSnippets(transcript: string, mentions: Mentions, windowChars = 350) {
  const pts: Array<{ kind:string; quote:string; position:number }> = [
    ...mentions.money_mentions.map(m => ({ kind: m.field_hint, quote: m.quote, position: m.position })),
    ...mentions.plan_mentions.map(p => ({ kind: "plan_type", quote: p.quote, position: p.position })),
    ...mentions.carrier_mentions.map(c => ({ kind: "carrier", quote: c.quote, position: c.position })),
    ...mentions.date_mentions.map(d => ({ kind: d.kind, quote: d.quote, position: d.position }))
  ];
  const snippets = pts.map(p => {
    const start = Math.max(0, p.position - windowChars);
    const end = Math.min(transcript.length, p.position + p.quote.length + windowChars);
    return { kind: p.kind, snippet: transcript.slice(start, end) };
  });
  // dedupe near-duplicates by snippet text
  const unique = new Map<string, { kind:string; snippet:string }>();
  for (const s of snippets) if (!unique.has(s.snippet)) unique.set(s.snippet, s);
  return Array.from(unique.values());
}

/** ---------- Early-exit rules (deterministic) ---------- */
function hasStrongSaleCues(signals: Mentions["signals"]) {
  const s = new Set(signals.sale_cues.map(x => x.toLowerCase()));
  const keys = ["approved","successfully signed","member id","text sent","card on file"];
  return keys.some(k => Array.from(s).some(v => v.includes(k)));
}

function pickLatest<T extends { position:number }>(arr: T[]): T | null {
  if (!arr?.length) return null;
  return arr.slice().sort((a,b)=>a.position-b.position)[arr.length-1];
}

/** money normalization for the common compact forms; mirrors Pass B prompt */
function normalizeMoney(field: "monthly_premium"|"first_month_bill"|"enrollment_fee"|"generic", raw: string): number | null {
  const text = raw.toLowerCase().replace(/[, ]+/g,' ').trim();
  // Skip phone numbers, percentages, addresses, obvious dates
  if (/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text)) return null;
  if (/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/.test(text)) return null;
  if (/\b100 ?%\b/.test(text)) return null;
  if (/^\d{1,5}\s+[A-Za-z]/.test(text)) return null;

  // $X.YY and NN¢ pattern like "$5.10 and 56¢"
  const numPlusCents = text.match(/\$?\s*(\d{1,3})(?:\.(\d{1,2}))?\s*(?:and\s+(\d{1,2})\s*(?:cents|¢))?/);
  if (numPlusCents) {
    const dollars = parseInt(numPlusCents[1],10);
    const dec = numPlusCents[2] ? parseInt(numPlusCents[2],10) : null;
    const centsExplicit = numPlusCents[3] ? parseInt(numPlusCents[3],10) : null;

    let value = dec!=null ? dollars + dec/100 : dollars;
    const compactTrigger = dollars < 50 && ( (dec!=null && dec%10===0) || centsExplicit!=null );
    if ((field === "monthly_premium" || field === "first_month_bill") && compactTrigger) {
      const tens = dec!=null ? Math.floor(dec/10) : 0;
      const cents = centsExplicit!=null ? centsExplicit : (dec!=null && dec%10!==0 ? dec : 0);
      value = dollars*100 + tens*10 + cents/100;
    }
    if (field === "enrollment_fee" && value < 10) value = value * 100;
    return Math.round(value*100)/100;
  }

  // "under $5.50"
  const under = text.match(/under\s*\$?\s*(\d{1,3})(?:\.(\d{1,2}))?/);
  if ((field === "monthly_premium" || field === "first_month_bill") && under) {
    const d = parseInt(under[1],10);
    return d < 50 ? d*100 : d;
  }

  // "four sixty" / "five twenty nine" / "one oh five" / "one hundred twenty five"
  const words = text.match(/\b(one|two|three|four|five|six|seven|eight|nine)\s+(oh|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s+(one|two|three|four|five|six|seven|eight|nine))?\b/)
         || text.match(/\b(one|two|three|four|five|six|seven|eight|nine)\s+hundred(?:\s+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety))?(?:\s+(one|two|three|four|five|six|seven|eight|nine))?\b/);
  if (words) {
    const map:any = {zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
    const toks = words[0].split(/\s+/);
    let val = 0;
    if (toks.includes("hundred")) {
      const h = map[toks[0]] || 0;
      const t = map[toks[2]] || 0;
      const o = map[toks[3]] || 0;
      val = h*100 + t + o;
    } else {
      const h = map[toks[0]] || 0;
      const t = toks[1]==="oh" ? 0 : (map[toks[1]] || 0);
      const o = map[toks[2]] || 0;
      val = h*100 + t + o;
    }
    return Math.round(val*100)/100;
  }

  // Generic small numbers outside fee context: ignore
  const single = text.match(/\$?\s*(\d{1,4})(?:\.(\d{1,2}))?/);
  if (single) {
    let v = parseFloat(single[1] + (single[2]? "."+single[2] : ""));
    if (field === "enrollment_fee" && v < 10) return Math.round(v*10000)/100; // fee hundreds
    if ((field === "monthly_premium" || field === "first_month_bill") && v < 50) return Math.round(v*10000)/100; // hundreds inference fallback
    return Math.round(v*100)/100;
  }

  return null;
}

/** Build stitched contexts and decide whether to early-exit */
export function earlyExitWhiteCard({ mentions, callYear }: { mentions: Mentions; callYear: number }): WhiteCard | null {
  if (!hasStrongSaleCues(mentions.signals)) return null;

  const latestPremium = pickLatest(mentions.money_mentions.filter(m => m.field_hint==="monthly_premium"));
  const latestFee = pickLatest(mentions.money_mentions.filter(m => m.field_hint==="enrollment_fee"));
  const plan = pickLatest(mentions.plan_mentions);
  const carrier = pickLatest(mentions.carrier_mentions);
  const eff = pickLatest(mentions.date_mentions.filter(d => d.kind==="effective_date"));

  if (!latestPremium || !latestFee || !plan || !carrier || !eff) return null;

  const premium = normalizeMoney("monthly_premium", latestPremium.value_raw);
  const fee = normalizeMoney("enrollment_fee", latestFee.value_raw);
  if (premium==null || fee==null) return null;

  // Effective-date normalization: parse "November 1" with callYear; US month names only
  const m = eff.value_raw.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b\s*(\d{1,2})/i);
  const iso = m ? `${callYear}-${pad2(monthToNum(m[1]))}-${pad2(parseInt(m[2],10))}` : null;

  const wc: WhiteCard = {
    outcome: "sale",
    monthly_premium: premium,
    enrollment_fee: fee,
    reason: "Customer approved and completed enrollment steps",
    summary: "Customer agreed to plan and provided payment details, confirming enrollment.",
    customer_name: null,
    policy_details: {
      carrier: carrier.carrier || null,
      plan_type: plan.plan_type || null,
      effective_date: iso
    },
    red_flags: []
  };
  return wc;
}

function monthToNum(m: string){ const idx = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(m.toLowerCase()); return idx>=0? idx+1 : 1; }
function pad2(n:number){ return n<10? `0${n}` : String(n); }

/** ---------- PASS B: arbiter with snippets ---------- */
export async function arbitrateWhiteCard({
  mentions,
  contextSnippets,
  transcript,
  callMeta
}: {
  mentions: Mentions;
  contextSnippets: Array<{ kind:string; snippet:string }>;
  transcript: string;
  callMeta: { call_started_at_iso: string; tz: string };
}): Promise<WhiteCard> {
  const sys = await fetchFile("/prompts/passB_arbiter.md");
  const schema = await fetchJSON("/prompts/whitecard.schema.json");
  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `CALL_META:\n${JSON.stringify(callMeta)}\n\nMENTIONS_TABLE:\n${JSON.stringify(mentions)}\n\nCONTEXT_SNIPPETS:\n${JSON.stringify(contextSnippets)}\n` }
    ],
    response_format: { type: "json_schema", json_schema: { name: "WhiteCard", schema, strict: true } },
    max_tokens: 700,
    temperature: 0.1
  });
  return JSON.parse(resp.choices[0].message.content || "{}");
}

/** Public entry point: analyze with speed routing */
export async function analyzeCallTwoPass({
  transcript,
  call_started_at_iso,
  tz = "America/New_York"
}: {
  transcript: string;
  call_started_at_iso: string;
  tz?: string;
}): Promise<{ mentions: Mentions; whitecard: WhiteCard; context_snippets: Array<{kind:string;snippet:string}>; early_exit: boolean }> {
  const callYear = new Date(call_started_at_iso).getFullYear();
  const callMeta = { call_started_at_iso, tz };

  const mentions = await extractMentions({ transcript, callMeta });
  const early = earlyExitWhiteCard({ mentions, callYear });
  const snippets = buildContextSnippets(transcript, mentions);

  if (early) {
    return { mentions, whitecard: early, context_snippets: snippets, early_exit: true };
  }

  const whitecard = await arbitrateWhiteCard({ mentions, contextSnippets: snippets, transcript, callMeta });
  return { mentions, whitecard, context_snippets: snippets, early_exit: false };
}

/** --------- tiny helpers to load prompt/schema files in Node/Next --------- */
async function fetchFile(relPath: string) {
  // In Next.js / Node, adjust as needed for your runtime
  const fs = await import("fs/promises");
  const path = await import("path");
  const full = path.join(process.cwd(), relPath.replace(/^\//,""));
  return fs.readFile(full, "utf8");
}
async function fetchJSON(relPath: string) {
  const txt = await fetchFile(relPath);
  return JSON.parse(txt);
}