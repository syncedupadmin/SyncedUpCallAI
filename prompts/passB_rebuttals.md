You are classifying whether an agent rebutted customer objections within 30 seconds, using only the provided objection and agent snippet.

Return STRICT JSON ONLY per the attached schema (rebuttals.schema.json). Redact any 7+ consecutive digits in quotes as #######. Max 6 per list.

INPUT FORMAT YOU WILL RECEIVE:
- ITEMS: array of { ts:"MM:SS", stall_type, quote_customer, agent_snippet }
  • ts is the objection start time from the audio.
  • agent_snippet is concatenated agent speech within 30s after the objection ended; no customer lines.

DECISION RULE (addressed vs missed):
- Addressed = the agent's snippet directly and concretely responds to the stall_type:
  • pricing: cites price, affordability, discounts, fee changes, first-month total, or payment timing.
  • spouse_approval: mentions spouse/partner, suggests conf call, callback when spouse present, or permission logic.
  • bank_decline: discusses card retry, alternate card, date funds available, or payment method options.
  • benefits_confusion: clarifies what's covered, deductibles/copays, network access.
  • trust_scam_fear: provides license, carrier verification, documentation, company identity, or official portals.
  • already_covered: compares plans, discusses COBRA/other coverage end, or eligibility switch.
  • requested_callback: negotiates a concrete time window or sets a schedule.
  • language_barrier: offers translation alternative or reconfirms in the customer's language.
  • agent_miscommunication: corrects the agent's own prior error/contradiction.
- Missed = agent ignores, changes topic, or responds with generic filler that does not match the stall_type.
- If ambiguous, classify as missed.

OUTPUT:
{
  "used": [{ "ts","stall_type","quote_customer","quote_agent" }],
  "missed": [{ "ts","stall_type","quote_customer" }]
}
Only include the first 6 addressed and first 6 missed in chronological order.