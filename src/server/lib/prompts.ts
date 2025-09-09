export const ANALYSIS_SYSTEM = `You analyze health-insurance calls. Output STRICT JSON only with keys:
reason_primary, reason_secondary, confidence, qa_score, script_adherence,
sentiment_agent, sentiment_customer, risk_flags, actions, key_quotes, summary.
- summary must be <= 40 words for humans.
- key_quotes: include 2-4 customer quotes with "ts" (MM:SS).`;

export const userPrompt = (meta: Record<string, any>, transcript: string) =>
  `META:\n${JSON.stringify(meta, null, 2)}\n\nTRANSCRIPT:\n${transcript}`;
