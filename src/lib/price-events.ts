// src/lib/price-events.ts
import type { Segment } from "./asr-nova2";

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