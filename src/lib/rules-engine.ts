import { PLAYBOOK } from "@/domain/playbook";
import type { Segment } from "@/lib/asr-nova2";

export type Signals = {
  lang: "en"|"es"|"unknown";
  price_monthly_cents: number|null;
  enrollment_fee_cents: number|null;
  card_last4: string|null;
  card_spoken: boolean;
  sale_confirm_phrase: boolean;
  post_date_phrase: boolean;
  post_date_iso: string|null; // you can fill later if you add date parsing
  esign_sent: boolean;
  esign_confirmed: boolean;
  stalls: Array<{ ts:number; type:string; text:string }>;
  rebuttals_used: Array<{ ts:number; type:string; text:string }>;
  rebuttals_missed: Array<{ ts:number; type:string; text:string }>;
  asked_for_card_after_last_rebuttal: boolean;
};

const isES = (t:string) =>
  /[áéíóúñ]|(usted|firm(a|é)|correo|mañana|cobrar|cuota|plan)/i.test(t);
const cents = (d:number) => Math.round(d * 100);

export function extractMoneyCents(text:string): number[] {
  const out:number[] = [];
  text.replace(/\$?\s?(\d{1,4}(?:[.,]\d{2})?)/g, (_, num) => {
    const n = Number(String(num).replace(",", "."));
    if (!isNaN(n)) out.push(cents(n));
    return _;
  });
  return out;
}

export function computeSignals(segments: Segment[]): Signals {
  const s: Signals = {
    lang: "unknown",
    price_monthly_cents: null,
    enrollment_fee_cents: null,
    card_last4: null,
    card_spoken: false,
    sale_confirm_phrase: false,
    post_date_phrase: false,
    post_date_iso: null,
    esign_sent: false,
    esign_confirmed: false,
    stalls: [],
    rebuttals_used: [],
    rebuttals_missed: [],
    asked_for_card_after_last_rebuttal: false
  };

  const joined = segments.map(x => x.text).join(" ");
  s.lang = isES(joined) ? "es" : "en";

  // price: last agent amounts near end
  const agent = segments.filter(x => x.speaker === "agent");
  const lastAgentAmounts = extractMoneyCents(agent.slice(-30).map(x=>x.text).join(" "));
  if (lastAgentAmounts.length) s.price_monthly_cents = lastAgentAmounts.at(-1)!;

  // enrollment fee anywhere if labeled
  const feeHit = segments.find(seg =>
    PLAYBOOK.money.enrollment_fee_label.some(k => seg.text.toLowerCase().includes(k)) &&
    extractMoneyCents(seg.text).length
  );
  if (feeHit) s.enrollment_fee_cents = extractMoneyCents(feeHit.text)[0];

  // last4 (assumes upstream redaction except last 4)
  const last4 = joined.match(/\b(\d{4})\b(?=\D*$)/);
  if (last4) { s.card_last4 = last4[1]; s.card_spoken = true; }

  const hit = (arr:readonly string[]) => arr.some(p => joined.toLowerCase().includes(p.toLowerCase()));
  s.post_date_phrase = hit(PLAYBOOK.outcomes.phrases.post_date);
  s.sale_confirm_phrase = hit(PLAYBOOK.outcomes.phrases.sale_confirm);

  s.esign_sent = hit(PLAYBOOK.outcomes.esign.sent);
  s.esign_confirmed = hit(PLAYBOOK.outcomes.esign.confirmed);

  // stalls + rebuttals
  const windowMs = PLAYBOOK.objections.match_window_sec * 1000;
  segments.forEach(seg => {
    if (seg.speaker !== "customer") return;
    for (const [type, cues] of Object.entries(PLAYBOOK.objections.families)) {
      if (cues.some(c => seg.text.toLowerCase().includes(c.toLowerCase()))) {
        s.stalls.push({ ts: seg.startMs, type, text: seg.text });
      }
    }
  });
  for (const stall of s.stalls) {
    const rebut = segments.find(seg =>
      seg.speaker === "agent" &&
      seg.startMs >= stall.ts &&
      seg.startMs <= stall.ts + windowMs
    );
    if (rebut) s.rebuttals_used.push({ ts: rebut.startMs, type: stall.type, text: rebut.text });
    else       s.rebuttals_missed.push({ ts: stall.ts,        type: stall.type, text: "" });
  }
  s.rebuttals_used   = s.rebuttals_used.slice(0, PLAYBOOK.objections.max_tracked);
  s.rebuttals_missed = s.rebuttals_missed.slice(0, PLAYBOOK.objections.max_tracked);

  // ask for card after last rebuttal
  const lastReb = s.rebuttals_used.at(-1);
  if (lastReb) {
    s.asked_for_card_after_last_rebuttal = !!segments.find(seg =>
      seg.speaker === "agent" &&
      seg.startMs >= lastReb.ts &&
      /card|tarjeta|payment|pago/i.test(seg.text)
    );
  }

  return s;
}

export function decideOutcome(s: Signals) {
  if (s.post_date_phrase)  return { sale_status: "post_date" as const, payment_confirmed:false, post_date_iso: s.post_date_iso };
  if (s.sale_confirm_phrase) return { sale_status: "sale" as const,      payment_confirmed:true,  post_date_iso: null };
  return { sale_status: "none" as const, payment_confirmed:false, post_date_iso: null };
}