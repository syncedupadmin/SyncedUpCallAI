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
    reason_primary_span: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).nullable(),
    reason_primary_quote: z.string().optional()
  }).optional()
});