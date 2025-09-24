/**
 * Price Analysis - Unified Module
 * Combines money.ts and price-events.ts functionality
 */

import type { Segment } from "./asr-nova2";

// ============================================
// MONEY EXTRACTION (from money.ts)
// ============================================

const WORD = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
  ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16,
  seventeen:17, eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50,
  sixty:60, seventy:70, eighty:80, ninety:90, hundred:100
};

function wordsToNumber(str: string): number | null {
  // handles "two thirty two", "two hundred thirty two", "two thirty-two", "point/and eighteen"
  const cleaned = str.toLowerCase().replace(/[-,]/g,' ').replace(/\s+/g,' ').trim();
  let dollars = 0, cents = 0, seenPoint = false, buf = 0;

  const pushBuf = () => { dollars += buf; buf = 0; };

  for (const tok of cleaned.split(' ')) {
    if (tok === 'point' || tok === 'and') { seenPoint = true; continue; }
    const n = WORD[tok as keyof typeof WORD];
    if (n === undefined) { continue; }
    if (n === 100 && buf > 0) { buf *= 100; }
    else if (n >= 20 && n % 10 === 0 && buf > 0) { buf += n; } // thirty-two
    else { buf += n; }
  }
  pushBuf();

  if (seenPoint) {
    // crude grab for trailing cents words "eighteen" -> 18
    const m = cleaned.match(/(?:point|and)\s+([a-z\- ]+)/);
    if (m) {
      const c = wordsToNumber(m[1] || '');
      if (typeof c === 'number') cents = Math.min(99, c);
    }
  }
  return dollars * 100 + cents;
}

export function extractMoneyCandidates(text: string) {
  const candidates: { cents:number; ix:number; raw:string; context:string }[] = [];

  // 1) $232.18 / 232.18 / 232
  const re = /(?:\$|usd\s*)?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const dollars = parseInt(m[1].replace(/,/g,''), 10);
    const cents = m[2] ? parseInt(m[2].padEnd(2,'0'), 10) : 0;
    const total = dollars*100 + cents;
    // plausible monthly premiums live between $30 and $2000
    if (total >= 3000 && total <= 200000) {
      candidates.push({ cents: total, ix: m.index, raw: m[0], context: text.slice(Math.max(0,m.index-40), m.index+40) });
    }
  }

  // 2) "two hundred thirty two and 18"
  const wordish = /((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[\- ](?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen))*(?:\s+(?:and|point)\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen))?)/gi;
  while ((m = wordish.exec(text)) !== null) {
    const cents = wordsToNumber(m[1]);
    if (typeof cents === 'number' && cents >= 3000 && cents <= 200000) {
      candidates.push({ cents, ix: m.index, raw: m[0], context: text.slice(Math.max(0,m.index-40), m.index+40) });
    }
  }

  // Take the last plausible amount mentioned as the premium candidate
  candidates.sort((a,b)=>a.ix-b.ix);
  return candidates;
}

export function choosePremiumAndFee(transcript: string) {
  const cands = extractMoneyCandidates(transcript);
  if (!cands.length) return { premium_cents: null, fee_cents: null, evidence: null };

  // Heuristics: last amount near "per month|monthly|premium" = premium
  // First amount near "enrollment|signup|processing|application fee" = fee
  const near = (ix:number, kw:RegExp) => kw.test(transcript.slice(Math.max(0, ix-40), ix+40).toLowerCase());

  let premium = null, fee = null, pEv=null, fEv=null;

  for (const cand of cands) {
    if (!premium && near(cand.ix, /(per\s*month|monthly|a month|premium)/i)) { premium = cand.cents; pEv=cand; }
    if (!fee && near(cand.ix, /(enrollment|sign\s*up|processing|application)\s*fee/i)) { fee = cand.cents; fEv=cand; }
  }

  // Fallback: take the last candidate as premium if none matched keywords
  if (!premium) { const last = cands[cands.length-1]; premium = last.cents; pEv = last; }

  return {
    premium_cents: premium,
    fee_cents: fee,
    evidence: {
      premium_quote: pEv?.raw || null,
      premium_context: pEv?.context || null,
      fee_quote: fEv?.raw || null,
      fee_context: fEv?.context || null
    }
  };
}

// ============================================
// PRICE EVENTS TIMELINE (from price-events.ts)
// ============================================

// Simple currency extractor already exists in your stack; reuse its output if present.
// This fallback looks for $X.YY tokens in agent speech and builds a timeline.

const moneyRe = /\$?\s*(\d{1,4})(?:[.,](\d{2}))?/;
const MONEY = /(?:\$?\s*[0-9]{2,4}(?:\.[0-9]{2})?)/;

export type PriceEvent = {
  ms: number;
  amount_cents: number;
  kind: "premium" | "enroll_fee" | "discount" | "enrollment_fee" | "waive_fee" | "price_drop" | "quoted_premium";
  speaker?: "agent" | "customer";
};

export function extractPriceTimeline(segments: Segment[]): PriceEvent[] {
  const out: PriceEvent[] = [];
  for (const s of segments) {
    if (s.speaker !== "agent") continue;
    const t = s.text.toLowerCase();

    const m = t.match(moneyRe);
    if (m) {
      const cents = Number(m[1]) * 100 + Number(m[2] ?? 0);
      const kind: PriceEvent["kind"] =
        /\b(enrollment|activation)\b/.test(t) ? "enroll_fee" :
        /\b(discount|waive|save)\b/.test(t) ? "discount" :
        "premium";
      out.push({ ms: s.startMs, amount_cents: cents, kind, speaker: s.speaker });
    }
  }
  return out.sort((a,b)=>a.ms-b.ms);
}

export function detectPriceChanges(timeline: PriceEvent[]) {
  const premiums = timeline.filter(e=>e.kind==="premium" || e.kind==="quoted_premium").map(e=>e.amount_cents);
  const changed = premiums.length >= 2 && premiums[premiums.length-1] !== premiums[0];
  const discountCents = timeline.filter(e=>e.kind==="discount").reduce((s,e)=>s+e.amount_cents,0);
  const enrollMentioned = timeline.some(e=>e.kind==="enroll_fee" || e.kind==="enrollment_fee");

  // Enhanced direction tracking
  let direction: "down" | "up" | "mixed" | "none" = "none";
  let discountCentsTotal = 0;
  let upsellCentsTotal = 0;

  if (premiums.length >= 2) {
    const firstPremium = premiums[0];
    const lastPremium = premiums[premiums.length - 1];
    const netChange = lastPremium - firstPremium;

    // Track all price movements
    let hasIncrease = false;
    let hasDecrease = false;

    for (let i = 1; i < premiums.length; i++) {
      const delta = premiums[i] - premiums[i - 1];
      if (delta > 0) {
        hasIncrease = true;
        upsellCentsTotal += delta;
      } else if (delta < 0) {
        hasDecrease = true;
        discountCentsTotal += Math.abs(delta);
      }
    }

    // Determine direction
    if (hasIncrease && hasDecrease) {
      direction = "mixed";
    } else if (netChange < 0) {
      direction = "down";
      discountCentsTotal = Math.abs(netChange);
    } else if (netChange > 0) {
      direction = "up";
      upsellCentsTotal = netChange;
    }
  } else if (discountCents > 0) {
    // If we only have discount events without premium changes
    direction = "down";
    discountCentsTotal = discountCents;
  }

  return {
    price_change: changed,
    direction,
    final_premium_cents: premiums.length ? premiums[premiums.length - 1] : null,
    initial_premium_cents: premiums.length ? premiums[0] : null,
    discount_cents_total: discountCentsTotal > 0 ? discountCentsTotal : null,
    upsell_cents_total: upsellCentsTotal > 0 ? upsellCentsTotal : null,
    enroll_fee_mentioned: enrollMentioned,
    price_events_count: timeline.length
  };
}

// Original function maintained for backward compatibility
export function extractPriceEvents(segments: Segment[]){
  const events:any[] = [];
  for (const s of segments){
    const m = s.text.match(MONEY);
    if (!m) continue;
    const amt = Number(String(m[0]).replace(/[^0-9.]/g,""));
    const lower = s.text.toLowerCase();
    if (/enrollment|enrol(l)?ment|sign ?up fee|activation/.test(lower)) {
      events.push({ kind:"enrollment_fee", amount:amt, currency:"USD", ts:mmss(s.startMs), speaker:s.speaker });
    } else if (/(waive|wave).*(fee)/.test(lower)) {
      events.push({ kind:"waive_fee", amount:amt, currency:"USD", ts:mmss(s.startMs), speaker:s.speaker });
    } else if (/(drop.*to|down to|lower.*to)/.test(lower)) {
      events.push({ kind:"price_drop", amount:amt, currency:"USD", ts:mmss(s.startMs), speaker:s.speaker });
    } else if (/(discount|off)/.test(lower)) {
      events.push({ kind:"discount", amount:amt, currency:"USD", ts:mmss(s.startMs), speaker:s.speaker });
    } else {
      // default assume quoted premium (monthly)
      events.push({ kind:"quoted_premium", amount:amt, currency:"USD", ts:mmss(s.startMs), speaker:s.speaker });
    }
  }
  // final premium = last quoted_premium amount if present
  const last = [...events].reverse().find(e=>e.kind==="quoted_premium");
  const facts = { pricing: {
    premium_amount: last ? last.amount : null,
    premium_unit: "monthly" as const,
    signup_fee: events.find(e=>e.kind==="enrollment_fee")?.amount ?? null,
    discount_amount: events.filter(e=>e.kind==="discount").reduce((s,e)=>s+e.amount, 0) || null
  }};
  return { price_events:events, facts };
}

const mmss = (ms:number) => {
  const s = Math.floor(ms/1000);
  return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
};