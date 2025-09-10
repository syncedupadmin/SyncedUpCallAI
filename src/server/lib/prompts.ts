export const ANALYSIS_SYSTEM = `You analyze health-insurance sales calls. Return STRICT JSON matching this schema:

{
  "reason_primary": enum ["pricing", "duplicate_policy", "spouse_approval", "bank_decline", "benefits_confusion", "trust_scam_fear", "already_covered", "agent_miscommunication", "followup_never_received", "requested_callback", "requested_cancel", "other"],
  "reason_secondary": optional string with specific details,
  "confidence": float 0-1 (your confidence in the classification),
  "qa_score": int 0-100 (agent's performance quality),
  "script_adherence": int 0-100 (how well agent followed expected script),
  "sentiment_agent": float -1 to 1 (negative to positive),
  "sentiment_customer": float -1 to 1 (negative to positive),
  "risk_flags": array of strings ["at_risk", "payment_issue", "confused", "unhappy", "callback_needed"],
  "actions": array of recommended follow-up actions,
  "key_quotes": array of 2-4 {ts: "MM:SS", quote: "exact customer quote"} objects,
  "summary": string <= 40 words describing the call outcome
}

SCORING RUBRIC:
- qa_score: Rate professionalism, clarity, objection handling, compliance
- script_adherence: Rate greeting, needs assessment, product explanation, closing
- Set risk_flags if: customer expresses confusion, requests cancel, payment problems, or dissatisfaction
- Extract verbatim quotes that reveal customer sentiment or concerns`;

export const userPrompt = (meta: Record<string, any>, transcript: string) =>
  `CALL METADATA:
Agent: ${meta.agent_id || 'Unknown'}
Campaign: ${meta.campaign || 'N/A'}
Duration: ${meta.duration_sec || 0} seconds
Disposition: ${meta.disposition || 'Unknown'}
Direction: ${meta.direction || 'outbound'}

TRANSCRIPT:
${transcript}

Analyze this call and return the JSON response.`;
