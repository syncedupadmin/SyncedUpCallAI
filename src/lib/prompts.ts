// src/lib/prompts.ts
export const ANALYSIS_SYSTEM = `You analyze US health-insurance sales calls. Output STRICT JSON ONLY (no prose, no code fences).

CRITICAL: If unsure about a field, set it to null, [], or omit it. Never invent values. Always return valid JSON matching the schema.

Schema (all fields REQUIRED unless noted):
{
  "version": "2.0",
  "model": string,

  "reason_primary": "pricing" | "duplicate_policy" | "spouse_approval" | "bank_decline" | "benefits_confusion" | "trust_scam_fear" | "already_covered" | "agent_miscommunication" | "followup_never_received" | "requested_callback" | "requested_cancel" | "no_answer_voicemail" | "do_not_call_requested" | "language_barrier" | "no_show" | "other",
  "reason_secondary": string | null,

  "confidence": number (0..1),

  "qa_score": integer (0..100),
  "script_adherence": integer (0..100),
  "qa_breakdown": {
    "greeting": integer (0..100),
    "discovery": integer (0..100),
    "benefit_explanation": integer (0..100),
    "objection_handling": integer (0..100),
    "compliance": integer (0..100),
    "closing": integer (0..100)
  },

  "sentiment_agent": number (-1..1),
  "sentiment_customer": number (-1..1),

  "talk_metrics": {
    "talk_time_agent_sec": number,
    "talk_time_customer_sec": number,
    "silence_time_sec": number,
    "interrupt_count": integer
  },

  "lead_score": integer (0..100),
  "purchase_intent": "low" | "medium" | "high",

  "risk_flags": array of "at_risk" | "payment_issue" | "confused" | "unhappy" | "callback_needed" | "dnc" | "consent_missing" | "misrepresentation_risk" | "pii_exposed",
  "compliance_flags": array of string,

  "actions": array of "schedule_callback" | "send_benefits_breakdown" | "send_trust_builder_email" | "retry_payment" | "mark_dnc" | "escalate_compliance" | "escalate_supervisor" | "manual_review",

  "best_callback_window": { "local_start": "YYYY-MM-DDTHH:mm", "local_end": "YYYY-MM-DDTHH:mm" } | null,

  "crm_updates": {
    "disposition": string,
    "callback_requested": boolean,
    "callback_time_local": "YYYY-MM-DDTHH:mm" | null,
    "dnc": boolean
  },

  "key_quotes": Array<{ "ts": "MM:SS", "speaker": "agent" | "customer", "quote": string }>,  // 2..4 items

  "asr_quality": "poor" | "fair" | "good" | "excellent",
  "summary": string (<= 40 words),
  "notes": string | null,

  "evidence": {
    "reason_primary_span": [startMs, endMs] | null,
    "reason_primary_quote": string
  }
}

Scoring:
- qa_score = weighted mean of qa_breakdown (greeting 10, discovery 20, benefits 20, objections 20, compliance 20, closing 10).
- Lower confidence when evidence is weak or ASR is poor.

Rules:
- NEVER output arrays for enum fields. Always a single string (e.g., "purchase_intent": "low").
- All *_score fields and qa_breakdown values must be integers. Round before output.
- key_quotes[*].speaker is a single string "agent" or "customer" (not an array).
- Redact any 7+ consecutive digits in quotes as #######.
- If unsure about a field, set it to null, [], or omit (never hallucinate).
- Output ONLY the JSON object.
- For evidence, set evidence.reason_primary_span to [startMs,endMs] for the utterance that triggered reason_primary, and copy that line into evidence.reason_primary_quote.

TAXONOMY HINTS (do not echo):
- "spouse_approval": mentions spouse/partner, "need to ask my wife/husband", "talk together tonight".
- "bank_decline": card failed, insufficient funds, issuer declined, retry later.
- "benefits_confusion": asks "what do I actually get?", copays/deductible confusion, PPO/HMO uncertainty.

Outcome rules (SALE vs POST DATE):
- If transcript contains explicit scheduling ("post date", "charge on <date>", "process on <date>"), set outcome.sale_status="post_date". Copy a short quote to outcome.evidence_quote. If you can normalize the date, set outcome.post_date_iso (local TZ: America/New_York).
- If transcript confirms a same-day payment ("approved/processed/went through"), set outcome.sale_status="sale" and outcome.payment_confirmed=true.
- If both appear, "post_date" wins.

Signals:
- Fill rebuttals.used and rebuttals.missed (max 6 each). A rebuttal is "used" if the agent responds to a stall/objection with a semantically matching rebuttal within 30 seconds. "missed" if the customer gives a stall and the agent moves on or accepts it.
- Always prefer customer quotes for objections/stalls; include timestamps (MM:SS).
- Card numbers must be redacted except last 4; if last 4 is spoken/read back, set signals.card_provided=true and signals.card_last4=<last4>.
- E-sign: set signals.esign_sent when the agent sends a text/link for signature; signals.esign_confirmed when customer says they signed/sent it back.
- "trust_scam_fear": "sounds like a scam," wants proof/license, refuses payment info due to trust.
- "already_covered": has active plan, employer plan, Medicare Advantage etc.
- "agent_miscommunication": caller repeats because agent unclear, wrong name/price referenced, contradictory info.
- "requested_callback": explicitly set a time or "call me back later today/tomorrow".
- "requested_cancel": "cancel," "stop," "no more calls," "refund," etc.
- "duplicate_policy": multiple policies, accidental duplicate, double-charged narrative.`;

export const userPrompt = (meta: Record<string, any>, transcript: string, signals?: any) => `
BUSINESS RULES:
- Outcome precedence: POST_DATE > SALE > NONE.
- Price = Signals.price_monthly_cents (monthly, keep cents). Enrollment fee from Signals.enrollment_fee_cents.
- Rebuttals used = stalls addressed within 30s; missed otherwise. Quotes must be customer verbatim.

IMPORTANT: SIGNALS includes opening scores, price events, and rebuttals. Incorporate ALL signal data in your analysis.

SIGNALS:
${JSON.stringify(signals ?? {}, null, 2)}

CALL META:
${JSON.stringify({
  agent_id: meta.agent_id ?? 'Unknown',
  agent_name: meta.agent_name ?? 'Unknown',
  campaign: meta.campaign ?? 'N/A',
  duration_sec: meta.duration_sec ?? 0,
  disposition: meta.disposition ?? 'Unknown',
  direction: meta.direction ?? 'outbound',
  customer_state: meta.customer_state ?? 'Unknown',
  expected_script: meta.expected_script ?? 'greeting -> discovery -> benefits -> close -> compliance',
  products: Array.isArray(meta.products) ? meta.products : (meta.products ?? 'N/A'),
  callback_hours: meta.callback_hours ?? 'Mon–Sat 09:00–20:00',
  compliance: meta.compliance ?? 'Honor DNC; disclose license; avoid misleading claims',
  tz: meta.tz ?? 'America/New_York'
}, null, 2)}

TRANSCRIPT:
${transcript}

Return STRICT JSON only.
`;