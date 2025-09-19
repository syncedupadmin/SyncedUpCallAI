// src/lib/analysis-schema.ts
import { z } from "zod";

// Export additional schemas for reuse
export const OutcomeSchema = z.object({
  sale_status: z.enum(["sale","post_date","none"]),
  payment_confirmed: z.boolean(),
  post_date_iso: z.string().nullable()
});

export const RebuttalItemSchema = z.object({
  ts: z.string().default(""),
  type: z.string().default(""),
  quote: z.string().default("")
});

export const SignalsSchema = z.object({
  card_provided: z.boolean().default(false),
  card_last4: z.string().regex(/^\d{4}$/).nullable().default(null)
}).partial();

export const AnalysisSchema = z
  .object({
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
  ])).default([]),
  compliance_flags: z.array(z.string()).default([]),
  actions: z.array(z.enum([
    "schedule_callback","send_benefits_breakdown","send_trust_builder_email",
    "retry_payment","mark_dnc","escalate_compliance","escalate_supervisor","manual_review"
  ])).default([]),
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
  // ✅ Make key_quotes optional & min(0)
  key_quotes: z.array(z.object({
    ts: z.string(),
    speaker: z.enum(["agent","customer"]),
    quote: z.string()
  })).min(0).max(4).optional(),
  asr_quality: z.enum(["poor","fair","good","excellent"]).optional(),
  // ✅ Make summary optional (keep the cap if present)
  summary: z.string().max(200).optional(),
  notes: z.string().max(200).nullable().optional(),
  // ✅ Evidence is optional
  evidence: z.object({
    reason_primary_span: z.tuple([
      z.number().int().nonnegative(),
      z.number().int().nonnegative()
    ]).nullable(),
    reason_primary_quote: z.string().optional()
  }).optional(),

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
      premium_amount: z.number().nullable().optional(),
      premium_unit: z.literal("monthly").optional(),
      signup_fee: z.number().nullable().optional(),
      discount_amount: z.number().nullable().optional(),
    }).partial().optional(),
    plan: z.object({
      plan_name: z.string().nullable().optional(),
    }).partial().optional()
  }).partial().optional(),


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

  // These blocks are added by the rule-engine; allow them if present
  outcome: z.object({
    sale_status: z.enum(["sale","post_date","none"]),
    payment_confirmed: z.boolean(),
    post_date_iso: z.string().nullable()
  }).optional(),

  signals: z.object({
    card_provided: z.boolean().optional(),
    card_last4: z.string().regex(/^\d{4}$/).nullable().optional(),
    esign_sent: z.boolean().optional(),
    esign_confirmed: z.boolean().optional(),
    charge_confirmed_phrase: z.boolean().optional(),
    post_date_phrase: z.boolean().optional()
  }).optional(),

  rebuttals: z.object({
    used: z.array(z.object({
      type: z.string(),
      ts: z.string(),
      quote: z.string()
    })).optional(),
    missed: z.array(z.object({
      type: z.string(),
      at_ts: z.string(),
      stall_quote: z.string()
    })).optional(),
    counts: z.object({
      used: z.number().int().nonnegative(),
      missed: z.number().int().nonnegative(),
      asked_for_card_after_last_rebuttal: z.boolean()
    }).optional()
  }).optional()
  })
  // ✅ Don't fail on extra keys from the model or rule engine
  .passthrough();