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
  opening_rebuttals_used: Array<{ ts:number; type:string; text:string }>;
  opening_rebuttals_missed: Array<{ ts:number; type:string; text:string }>;
  callback_set: boolean;
  call_type: "outbound"|"inbound"|"transfer"|"unknown";
};

const isES = (t:string) =>
  /[áéíóúñ]|(usted|firm(a|é)|correo|mañana|cobrar|cuota|plan)/i.test(t);
const cents = (d:number) => Math.round(d * 100);

// ---------- fuzzy token similarity (simple, fast) ----------
function tokenSim(a: string, b: string) {
  const T = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
  const A = T(a), B = T(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const denom = Math.max(1, Math.sqrt(A.size * B.size));
  return inter / denom; // 0..1
}

function bestOpeningType(utterance: string): { type: keyof typeof PLAYBOOK.opening_objections; score: number } {
  let bestType: keyof typeof PLAYBOOK.opening_objections = "other";
  let best = 0;
  for (const [type, examples] of Object.entries(PLAYBOOK.opening_objections) as any) {
    for (const ex of examples) {
      const s = tokenSim(utterance, ex);
      if (s > best) { best = s; bestType = type; }
    }
  }
  return { type: bestType, score: best };
}

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
    asked_for_card_after_last_rebuttal: false,
    opening_rebuttals_used: [],
    opening_rebuttals_missed: [],
    callback_set: false,
    call_type: "unknown"
  };

  const joined = segments.map(x => x.text).join(" ");
  s.lang = isES(joined) ? "es" : "en";

  // DEBUG: Log signal extraction
  console.log('=== SIGNAL EXTRACTION DEBUG ===');
  console.log('Checking for sale phrases in first 500 chars:', joined.substring(0, 500));
  console.log('Full transcript length:', joined.length);

  // Opening objections detection (0-30s)
  const openingEnd = PLAYBOOK.opening_window_ms;
  const openingWindowSec = 10; // 10 second window for agent response

  // Scan customer utterances in first window for opening objections
  for (const seg of segments) {
    if (seg.speaker !== "customer") continue;
    const start = seg.startMs ?? 0;
    if (start > openingEnd) break;

    // Use fuzzy matching to classify the objection type
    const { type, score } = bestOpeningType(seg.text);

    // Only match if above threshold
    if (score >= PLAYBOOK.opening_fuzzy_threshold) {
      // Look for agent response within window
      const agentResponse = segments.find(s =>
        s.speaker === "agent" &&
        s.startMs >= start &&
        s.startMs <= start + (openingWindowSec * 1000)
      );

      if (agentResponse) {
        s.opening_rebuttals_used.push({
          ts: agentResponse.startMs,
          type,
          text: agentResponse.text
        });
      } else {
        s.opening_rebuttals_missed.push({
          ts: start,
          type,
          text: seg.text
        });
      }
    }
  }

  // price: last agent amounts near end
  const agent = segments.filter(x => x.speaker === "agent");
  const last30AgentText = agent.slice(-30).map(x=>x.text).join(" ");
  console.log('Looking for price in last 30 agent segments:', last30AgentText.substring(0, 500));
  const lastAgentAmounts = extractMoneyCents(last30AgentText);
  console.log('Prices found:', lastAgentAmounts.map(c => `$${c/100}`));
  if (lastAgentAmounts.length) s.price_monthly_cents = lastAgentAmounts.at(-1)!;
  console.log('Selected price_monthly_cents:', s.price_monthly_cents ? `$${s.price_monthly_cents/100}` : 'none');

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

  // DEBUG: Log what phrases we're checking for
  console.log('Checking for post_date phrases:', PLAYBOOK.outcomes.phrases.post_date);
  console.log('Checking for sale_confirm phrases:', PLAYBOOK.outcomes.phrases.sale_confirm);

  s.post_date_phrase = hit(PLAYBOOK.outcomes.phrases.post_date);
  s.sale_confirm_phrase = hit(PLAYBOOK.outcomes.phrases.sale_confirm);

  console.log('Found sale confirm:', s.sale_confirm_phrase);
  console.log('Found post date:', s.post_date_phrase);
  console.log('=== END SIGNAL EXTRACTION DEBUG ===');

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

  // Callback set if agent proposes a time and customer agrees OR agent confirms a scheduled time
  const lowerSegs = segments.map(seg => ({...seg, t: seg.text.toLowerCase()}));
  s.callback_set = lowerSegs.some(seg =>
    seg.speaker === "agent" && /\b(callback|call you back|tomorrow|later today|this evening|at \d{1,2}(:\d{2})?\s?(am|pm))\b/.test(seg.t)
  );

  // Call type inference (simple heuristic - can be enhanced with metadata)
  const firstAgentText = segments.find(seg => seg.speaker === "agent")?.text.toLowerCase() || "";
  if (/transfer|transferred|connecting you/i.test(firstAgentText)) {
    s.call_type = "transfer";
  } else if (/thank you for calling|how can i help/i.test(firstAgentText)) {
    s.call_type = "inbound";
  } else if (/this is|my name is|calling from/i.test(firstAgentText)) {
    s.call_type = "outbound";
  } else {
    s.call_type = "unknown";
  }

  return s;
}

export function decideOutcome(s: Signals) {
  if (s.post_date_phrase)  return { sale_status: "post_date" as const, payment_confirmed:false, post_date_iso: s.post_date_iso };
  if (s.sale_confirm_phrase) return { sale_status: "sale" as const,      payment_confirmed:true,  post_date_iso: null };
  return { sale_status: "none" as const, payment_confirmed:false, post_date_iso: null };
}