import { STALLS, REBUTTALS, RebuttalType } from "./rebuttal-lexicon";
import type { Segment } from "./asr-nova2";

function ts(ms: number){ const s = Math.round(ms/1000); return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; }

function hits(text: string, regs: RegExp[]) { return regs.some(r => r.test(text)); }

export function detectRebuttals(segments: Segment[]){
  const used: {type:RebuttalType; ts:string; quote:string}[] = [];
  const missed: {type:RebuttalType; at_ts:string; stall_quote:string}[] = [];
  let lastStall: {type:RebuttalType; at:number; quote:string}|null = null;
  let askedForCardAfterLast = false;

  for (const s of segments){
    const t = s.text.toLowerCase();
    // capture stalls from customer
    if (s.speaker === "customer"){
      const type = (Object.keys(STALLS) as RebuttalType[]).find(k => hits(t, STALLS[k])) as RebuttalType|undefined;
      if (type){
        lastStall = { type, at: s.startMs, quote: s.text };
      }
      continue;
    }
    // agent turn
    if (s.speaker === "agent"){
      if (lastStall){
        const type = lastStall.type;
        const rebut = hits(t, REBUTTALS[type]);
        if (rebut){
          used.push({ type, ts: ts(s.startMs), quote: s.text });
          lastStall = null;
        } else if (/card|visa|master|discover|amex|payment|pay/i.test(t)){
          askedForCardAfterLast = true;
        }
      }
    }
    // auto-expire a missed rebuttal if 30s go by without a match
    if (lastStall && s.startMs - lastStall.at > 30000){
      missed.push({ type: lastStall.type, at_ts: ts(lastStall.at), stall_quote: lastStall.quote });
      lastStall = null;
    }
  }
  if (lastStall){
    missed.push({ type: lastStall.type, at_ts: ts(lastStall.at), stall_quote: lastStall.quote });
  }
  return {
    used,
    missed,
    counts: { used: used.length, missed: missed.length, asked_for_card_after_last_rebuttal: askedForCardAfterLast }
  };
}