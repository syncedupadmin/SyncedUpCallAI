// src/lib/analysis-schema.ts
import { z } from "zod";

export const AnalysisSchema = z.object({
  version: z.literal("2.0"),
  model: z.string(),
  reason_primary: z.enum([
    "pricing","duplicate_policy","spouse_approval","bank_decline","benefits_confusion",
    "trust_scam_fear","already_covered","agent_miscommunication","followup_never_received",
    "requested_callback","requested_cancel","no_answer_voicemail","do_not_call_requested",
    "language_barrier","no_show","other"
  ]),
  reason_secondary: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  qa_score: z.number().int().min(0).max(100),
  script_adherence: z.number().int().min(0).max(100),
  qa_breakdown: z.object({
    greeting: z.number().int().min(0).max(100),
    discovery: z.number().int().min(0).max(100),
    benefit_explanation: z.number().int().min(0).max(100),
    objection_handling: z.number().int().min(0).max(100),
    compliance: z.number().int().min(0).max(100),
    closing: z.number().int().min(0).max(100)
  }),
  sentiment_agent: z.number().min(-1).max(1),
  sentiment_customer: z.number().min(-1).max(1),
  talk_metrics: z.object({
    talk_time_agent_sec: z.number().nonnegative(),
    talk_time_customer_sec: z.number().nonnegative(),
    silence_time_sec: z.number().nonnegative(),
    interrupt_count: z.number().int().nonnegative()
  }),
  lead_score: z.number().int().min(0).max(100),
  purchase_intent: z.enum(["low","medium","high"]),
  risk_flags: z.array(z.enum([
    "at_risk","payment_issue","confused","unhappy","callback_needed",
    "dnc","consent_missing","misrepresentation_risk","pii_exposed"
  ])),
  compliance_flags: z.array(z.string()),
  actions: z.array(z.enum([
    "schedule_callback","send_benefits_breakdown","send_trust_builder_email",
    "retry_payment","mark_dnc","escalate_compliance","escalate_supervisor","manual_review"
  ])),
  best_callback_window: z.object({
    local_start: z.string(),
    local_end: z.string()
  }).nullable(),
  crm_updates: z.object({
    disposition: z.string(),
    callback_requested: z.boolean(),
    callback_time_local: z.string().nullable(),
    dnc: z.boolean()
  }),
  key_quotes: z.array(z.object({
    ts: z.string(),
    speaker: z.enum(["agent","customer"]),
    quote: z.string()
  })).min(0).max(4),
  asr_quality: z.enum(["poor","fair","good","excellent"]),
  summary: z.string().max(200),
  notes: z.string().max(200).nullable(),
  evidence: z.object({
    // fixed-length array (minItems=2, maxItems=2) that OpenAI accepts
    reason_primary_span: z.array(z.number().int().nonnegative()).length(2).nullable(),
    reason_primary_quote: z.string()                  // required key
  }).strict().nullable(),                             // required at root; nullable value; strict inner object

  // Openings & control
  opening_score: z.number().int().min(0).max(100).optional(),
  control_score: z.number().int().min(0).max(100).optional(),
  opening_feedback: z.array(z.string()).max(5).optional(),

  // Rebuttals and escapes
  escape_attempts: z.array(z.object({
    type: z.enum(["call_back","send_info","already_insured","not_interested","spouse","too_good_to_be_true","time_delay","other"]),
    ts: z.string(),
    quote_customer: z.string()
  })).optional(),
  rebuttals_used: z.array(z.object({
    id: z.string(),      // e.g., "OPEN_10TH_CALL", "PREQUAL_LOOP", "LEGIT_1", "ASSUME_SALE_VISA"
    bucket: z.enum(["opening","prequal","tie_down_affordability","tie_down_time","send_in_writing","spouse","legitimacy","assume_sale"]),
    ts: z.string(),
    quote_agent: z.string()
  })).optional(),
  rebuttals_missed: z.array(z.object({
    escape_type: z.string(),
    ts: z.string()
  })).optional(),
  rebuttal_summary: z.object({
    total_used: z.number().int().min(0),
    total_missed: z.number().int().min(0),
    used_ids: z.array(z.string()),
    missed_reasons: z.array(z.string()),
    asked_for_card_after_last_rebuttal: z.boolean()
  }).optional(),

  // Objections
  objections: z.array(z.object({
    type: z.enum(["pricing","spouse","benefits","trust","bank","already_covered","other"]),
    quote: z.string(),
    ts: z.string()
  })).max(3).optional(),

  // Pricing & plan
  price_events: z.array(z.object({
    kind: z.enum(["quoted_premium","enrollment_fee","discount","waive_fee","price_drop"]),
    amount: z.number(),
    currency: z.literal("USD"),
    ts: z.string(),
    speaker: z.enum(["agent","customer"])
  })).optional(),
  facts: z.object({
    pricing: z.object({
      premium_amount: z.number().nullable(),
      premium_unit: z.literal("monthly"),
      signup_fee: z.number().nullable(),
      discount_amount: z.number().nullable()
    }).optional(),
    plan: z.object({
      plan_name: z.string().nullable()
    }).optional()
  }).optional(),


  // Coaching flags
  coaching_flags: z.array(z.enum([
    "ignored_stated_objection",
    "did_not_use_rebuttals",
    "no_opening",
    "less_than_two_rebuttals",
    "did_not_ask_card_after_rebuttal"
  ])).optional(),

  // CRM snapshot
  crm_snapshot: z.object({
    disposition: z.string().nullable(),
    customer_name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable()
  }).optional(),

  // Outcome classification driven by explicit "sale vs post-date" logic
  outcome: z.object({
    sale_status: z.enum(["none","sale","post_date"]).default("none"),
    payment_confirmed: z.boolean().default(false),             // "charged/approved/processed"
    post_date_iso: z.string().nullable().default(null),        // ISO string when we caught a scheduled date
    evidence_quote: z.string().optional(),                     // short quote that triggered the status
  }).optional(),

  // Low-level signals we derive before/outside the LLM so you can audit the why
  signals: z.object({
    card_provided: z.boolean().default(false),
    card_last4: z.string().regex(/^\d{4}$/).nullable().default(null),
    esign_sent: z.boolean().default(false),                    // "I texted you a link", "e-sign", etc.
    esign_confirmed: z.boolean().default(false),               // "I signed it", "sent it back"
    charge_confirmed_phrase: z.boolean().default(false),       // "payment processed/approved/charged"
    post_date_phrase: z.boolean().default(false),              // "post date", "charge on the 15th…"
  }).optional(),

  // Rebuttals (used + missed) for the "Key Quotes" panel
  rebuttals: z.object({
    used: z.array(z.object({
      type: z.enum(["pricing","spouse","benefits","trust","callback","already_covered","bank","other"]),
      ts: z.string(),                 // MM:SS
      quote: z.string()
    })).max(6).default([]),
    missed: z.array(z.object({
      type: z.enum(["pricing","spouse","benefits","trust","callback","already_covered","bank","other"]),
      at_ts: z.string(),              // where the stall happened and no rebuttal followed
      stall_quote: z.string()
    })).max(6).default([]),
    counts: z.object({
      used: z.number().int().nonnegative().default(0),
      missed: z.number().int().nonnegative().default(0),
      asked_for_card_after_last_rebuttal: z.boolean().default(false)
    }).default({ used:0, missed:0, asked_for_card_after_last_rebuttal:false })
  }).optional()
});