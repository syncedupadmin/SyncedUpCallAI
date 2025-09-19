// src/lib/prompts.ts
export const ANALYSIS_SYSTEM = `You analyze US health-insurance sales calls. Output STRICT JSON ONLY matching this schema (no prose, no code fences).

SCHEMA:
{
  "version": "2.0",
  "model": string,
  "reason_primary": ["pricing","duplicate_policy","spouse_approval","bank_decline","benefits_confusion","trust_scam_fear","already_covered","agent_miscommunication","followup_never_received","requested_callback","requested_cancel","no_answer_voicemail","do_not_call_requested","language_barrier","no_show","other"],
  "reason_secondary": string|null,
  "confidence": number,
  "qa_score": number,
  "script_adherence": number,
  "qa_breakdown": { "greeting":0..100,"discovery":0..100,"benefit_explanation":0..100,"objection_handling":0..100,"compliance":0..100,"closing":0..100 },
  "sentiment_agent": number,
  "sentiment_customer": number,
  "talk_metrics": { "talk_time_agent_sec": number, "talk_time_customer_sec": number, "silence_time_sec": number, "interrupt_count": number },
  "lead_score": number,
  "purchase_intent": ["low","medium","high"],
  "risk_flags": ["at_risk","payment_issue","confused","unhappy","callback_needed","dnc","consent_missing","misrepresentation_risk","pii_exposed"],
  "compliance_flags": string[],
  "actions": ["schedule_callback","send_benefits_breakdown","send_trust_builder_email","retry_payment","mark_dnc","escalate_compliance","escalate_supervisor","manual_review"],
  "best_callback_window": { "local_start": "YYYY-MM-DDTHH:mm", "local_end": "YYYY-MM-DDTHH:mm" } | null,
  "crm_updates": { "disposition": string, "callback_requested": boolean, "callback_time_local": "YYYY-MM-DDTHH:mm" | null, "dnc": boolean },
  "key_quotes": [{ "ts":"MM:SS","speaker":["agent","customer"],"quote":"verbatim; redact any 7+ consecutive digits as #######"}],
  "asr_quality": ["poor","fair","good","excellent"],
  "summary": string,
  "notes": string|null
}

SCORING:
- qa_score = weighted mean of qa_breakdown: greeting 10%, discovery 20%, benefit_explanation 20%, objection_handling 20%, compliance 20%, closing 10%.
- Lower confidence if asr_quality is poor or evidence is weak.
- OUTPUT ONLY THE JSON OBJECT.`;

export const userPrompt = (meta: Record<string, any>, transcript: string) =>
`CALL METADATA:
Agent: ${meta.agent_id ?? 'Unknown'}
Agent Name: ${meta.agent_name ?? 'Unknown'}
Campaign: ${meta.campaign ?? 'N/A'}
Duration: ${meta.duration_sec ?? 0} seconds
Disposition: ${meta.disposition ?? 'Unknown'}
Direction: ${meta.direction ?? 'outbound'}
Local Timezone: ${meta.tz ?? 'America/New_York'}
Customer State: ${meta.customer_state ?? 'Unknown'}
Expected Script: ${meta.expected_script ?? 'greeting -> discovery -> benefits -> close -> compliance'}
Product Catalog: ${Array.isArray(meta.products) ? meta.products.join(', ') : (meta.products ?? 'N/A')}
Callback Hours Policy (local): ${meta.callback_hours ?? 'Mon–Sat 09:00–20:00'}
Important Compliance: ${meta.compliance ?? 'Honor DNC; disclose license; avoid misleading claims'}

TRANSCRIPT (speaker-tagged if available; timestamps allowed):
${transcript}

Analyze this call using ANALYSIS_SYSTEM and return the JSON response ONLY.`;