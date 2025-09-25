import OpenAI from "openai";

export type Segment = {
  speaker: "agent" | "customer";
  startMs: number;
  endMs: number;
  text: string;
  conf: number;
};

export type ObjectionSpan = {
  stall_type: "pricing"|"spouse_approval"|"bank_decline"|"benefits_confusion"|"trust_scam_fear"|"already_covered"|"agent_miscommunication"|"requested_callback"|"language_barrier"|"other";
  quote: string;
  position: number;
  startMs: number;
  endMs: number;
  speaker: "customer";
};

export type Rebuttals = {
  used: Array<{ ts: string; stall_type: ObjectionSpan["stall_type"]; quote_customer: string; quote_agent: string }>;
  missed: Array<{ ts: string; stall_type: ObjectionSpan["stall_type"]; quote_customer: string }>;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Embedded prompts and schemas
const passBRebuttalsPrompt = `You are classifying whether an agent rebutted customer objections within 30 seconds, using only the provided objection and agent snippet.

Return STRICT JSON ONLY per the attached schema (rebuttals.schema.json). Max 6 per list.

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
Only include the first 6 addressed and first 6 missed in chronological order.`;

const rebuttalsSchema = {
  "type": "object",
  "additionalProperties": false,
  "required": ["used", "missed"],
  "properties": {
    "used": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["ts","stall_type","quote_customer","quote_agent"],
        "properties": {
          "ts": { "type": "string", "pattern": "^\\d{2}:\\d{2}$" },
          "stall_type": { "enum": ["pricing","spouse_approval","bank_decline","benefits_confusion","trust_scam_fear","already_covered","agent_miscommunication","requested_callback","language_barrier","other"] },
          "quote_customer": { "type": "string", "maxLength": 200 },
          "quote_agent": { "type": "string", "maxLength": 200 }
        }
      }
    },
    "missed": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["ts","stall_type","quote_customer"],
        "properties": {
          "ts": { "type": "string", "pattern": "^\\d{2}:\\d{2}$" },
          "stall_type": { "enum": ["pricing","spouse_approval","bank_decline","benefits_confusion","trust_scam_fear","already_covered","agent_miscommunication","requested_callback","language_barrier","other"] },
          "quote_customer": { "type": "string", "maxLength": 200 }
        }
      }
    }
  }
};
const mmss = (ms:number) => {
  const total = Math.max(0, Math.floor(ms/1000));
  const m = Math.floor(total/60);
  const s = total % 60;
  return `${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`;
};

export function buildAgentSnippetsAroundObjections(segments: Segment[], objections: ObjectionSpan[], windowMs = 30000) {
  const items = [];
  for (const obj of objections) {
    const start = obj.endMs;
    const end = obj.endMs + windowMs;
    const agentUtterances = segments
      .filter(s => s.speaker === "agent" && s.startMs >= start && s.startMs <= end)
      .sort((a,b)=>a.startMs-b.startMs)
      .map(s => s.text.trim())
      .filter(Boolean);
    const agent_snippet = agentUtterances.join(" ").slice(0, 600);
    items.push({
      ts: mmss(obj.startMs),
      stall_type: obj.stall_type,
      quote_customer: obj.quote.slice(0, 200),
      agent_snippet: agent_snippet
    });
  }
  return items;
}

/**
 * Build the agent's immediate reply to each objection, deterministically.
 * Picks the first agent segment that starts at or after objection.endMs,
 * within a window (default 15 seconds). No LLM involved.
 */
export function buildImmediateReplies(
  segments: Segment[],
  objections: ObjectionSpan[],
  windowMs = 15000
) {
  const results = [];
  const agentSegs = segments.filter(s => s.speaker === "agent").sort((a,b)=>a.startMs-b.startMs);
  for (const obj of objections) {
    const start = obj.endMs;
    const end = obj.endMs + windowMs;
    const firstAgent = agentSegs.find(s => s.startMs >= start && s.startMs <= end);
    results.push({
      ts: mmss(obj.startMs),
      stall_type: obj.stall_type,
      quote_customer: obj.quote.slice(0, 220),
      quote_agent_immediate: firstAgent ? firstAgent.text.trim().slice(0, 220) : null
    });
  }
  return results;
}

export async function classifyRebuttals(items: Array<{ ts:string; stall_type: ObjectionSpan["stall_type"]; quote_customer:string; agent_snippet:string }>): Promise<Rebuttals> {
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: passBRebuttalsPrompt },
      { role: "user", content: `ITEMS:\n${JSON.stringify(items, null, 2)}` }
    ],
    response_format: { type: "json_schema", json_schema: { name: "Rebuttals", schema: rebuttalsSchema, strict: true } },
    max_tokens: 350,
    temperature: 0
  });

  const parsed = JSON.parse(resp.choices[0].message.content || "{}");
  // Enforce caps defensively
  parsed.used = Array.isArray(parsed.used) ? parsed.used.slice(0,6) : [];
  parsed.missed = Array.isArray(parsed.missed) ? parsed.missed.slice(0,6) : [];
  return parsed;
}

// File reading functions removed - prompts and schemas are now embedded