// src/lib/price-events.ts
import type { Segment } from "./asr-nova2";
const MONEY = /(?:\$?\s*[0-9]{2,4}(?:\.[0-9]{2})?)/;

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
    discount_amount: events.find(e=>e.kind==="discount")?.amount ?? null
  }};
  return { events, facts };
}

function mmss(ms:number){ const s=Math.floor(ms/1000), m=Math.floor(s/60); const sec=s%60; return `${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}`; }