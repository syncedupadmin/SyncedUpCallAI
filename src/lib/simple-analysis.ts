import OpenAI from "openai";
import { buildAgentSnippetsAroundObjections, classifyRebuttals, buildImmediateReplies, type Segment, type ObjectionSpan } from "./rebuttals";
import { computeTalkMetrics } from "./talk-metrics";
import { normalizeMoney, parseMoneyValue, type MoneyContext } from "./money-normalizer";
import { transcribeBulk, type Entity, type AsrOverrides } from "./asr-nova2";
import type { Settings } from "@/config/asr-analysis";
import { DEFAULTS } from "@/config/asr-analysis";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Embedded prompts to avoid file system issues in Next.js
const passAPrompt = `You extract structured mentions from U.S. health-insurance sales call transcripts.

Return STRICT JSON ONLY matching the schema below. Do not infer, summarize, or normalize. Redact any 7+ consecutive digits in QUOTES as #######. When unsure, omit the item. Positions are integer character offsets into the provided transcript string.

SCHEMA:
{
  "money_mentions": [
    {
      "field_hint": "monthly_premium" | "first_month_bill" | "enrollment_fee" | "generic",
      "value_raw": string,                 // verbatim numeric or words, do NOT normalize
      "quote": string,                      // ≤160 chars, verbatim from transcript with redaction
      "position": integer,                  // char index of the start of the quote
      "speaker": "agent" | "customer" | "unknown"
    }
  ],
  "plan_mentions": [
    {
      "plan_type": "PPO" | "HMO" | "EPO" | "POS" | "Medigap" | "ACA bronze" | "ACA silver" | "ACA gold" | "Short-term" | "Medicare Advantage" | "Open access",
      "quote": string,                      // ≤160 chars
      "position": integer                   // char index
    }
  ],
  "carrier_mentions": [
    { "carrier": string, "quote": string, "position": integer }
  ],
  "date_mentions": [
    { "kind": "effective_date" | "post_date" | "generic", "value_raw": string, "quote": string, "position": integer }
  ],
  "signals": {
    "sale_cues": string[],                  // e.g., "approved", "member ID", "successfully signed"
    "callback_cues": string[],              // e.g., "call me back", "after work"
    "red_flags_raw": string[]               // any of: "dnc_request","trust_scam_fear","bank_decline","language_barrier","benefits_confusion","requested_cancel"
  },
  "objection_spans": [
    {
      "stall_type": "pricing"|"spouse_approval"|"bank_decline"|"benefits_confusion"|"trust_scam_fear"|"already_covered"|"agent_miscommunication"|"requested_callback"|"language_barrier"|"other",
      "quote": string,                      // verbatim quote from customer
      "position": integer,                  // char index
      "startMs": integer,                   // millisecond timestamp
      "endMs": integer,                     // millisecond timestamp
      "speaker": "customer"
    }
  ]
}

RULES:
- field_hint via nearby cue words:
  - monthly_premium: "premium", "per month", "monthly"
  - first_month_bill: "first month", "first payment", "to start"
  - enrollment_fee: "enrollment fee", "activation fee"
  - generic: any money mention not clearly the above
- plan_mentions only when the exact plan type string appears in transcript (use agent's words).
- Positions: find the first character index of the quote in the full transcript string provided.
- Never normalize money or dates here. Just capture the raw phrase and quote.
- Redact 7+ digit runs in quotes as #######.

OUTPUT: JSON object only.

EXAMPLES (money):
Text: ... "the monthly premium is $5.10 and 56¢" ...
→ money_mentions += { field_hint:"monthly_premium", value_raw:"$5.10 and 56¢", quote:"the monthly premium is $5.10 and 56¢", position: <index>, speaker:"agent" }

Text: ... "the enrollment fee is one twenty five" ...
→ money_mentions += { field_hint:"enrollment_fee", value_raw:"one twenty five", quote:"the enrollment fee is one twenty five", position:<index>, speaker:"agent" }

Text: ... "first month's bill under $5.50" ...
→ money_mentions += { field_hint:"first_month_bill", value_raw:"under $5.50", quote:"first month's bill under $5.50", position:<index>, speaker:"agent" }

EXAMPLES (plan correction):
Text: "... it's a PPO ... I apologize ... it's an open access plan with Paramount ..."
→ plan_mentions += { plan_type:"PPO", quote:"it's a PPO", position:<i> }
→ plan_mentions += { plan_type:"Open access", quote:"it's an open access plan with Paramount", position:<j> }

EXAMPLES (signals):
Text: "... approved ... member ID is 685417634 ..."
→ sale_cues += ["approved","member ID"]

OBJECTION DETECTION:
- Only capture CUSTOMER objections/stalls that fit the stall_type enum exactly
- Include millisecond timestamps from the audio (startMs, endMs)
- Stall types to detect:
  • pricing: cost concerns, too expensive, can't afford
  • spouse_approval: need to talk to spouse/partner/family
  • bank_decline: card declined, payment issues
  • benefits_confusion: confusion about coverage
  • trust_scam_fear: scam fears, legitimacy concerns
  • already_covered: has existing insurance
  • requested_callback: asks to call back later
  • language_barrier: language difficulties
  • agent_miscommunication: agent error/contradiction
  • other: clear objection not fitting above

EXAMPLES (objections):
Text: "I need to talk to my wife first" (at 10000ms-12000ms)
→ objection_spans += { stall_type:"spouse_approval", quote:"I need to talk to my wife first", position:<i>, startMs:10000, endMs:12000, speaker:"customer" }

Text: "This sounds too expensive for me" (at 20000ms-22000ms)
→ objection_spans += { stall_type:"pricing", quote:"This sounds too expensive for me", position:<j>, startMs:20000, endMs:22000, speaker:"customer" }`;

const passBPrompt = `You are the ARBITER. Build the final white card JSON strictly by the provided schema. Never invent values. Redact any 7+ consecutive digits in QUOTES as ####### inside reason/summary if you include quotes.

INPUTS YOU WILL RECEIVE:
1) MENTIONS_TABLE: the Pass A JSON
2) TRANSCRIPT: the full speaker-labeled transcript string
3) CALL_META: includes call_started_at_iso and tz ("America/New_York")

DECISION RULES (from project code, apply exactly):
- Conflict order:
  1) EVENTS array with corrected=true (if provided)  // if not provided, skip this step
  2) EVENTS array without correction                  // if not provided, skip this step
  3) Latest explicit AGENT quote unless customer corrects and agent agrees
  4) null if ambiguous

- Outcome:
  sale: customer explicitly agrees AND provides/confirms payment/enrollment ("approved", "member ID", "successfully signed").
  callback: caller asks for later call or schedules time.
  no_sale: otherwise.

- Money normalization (apply only when context matches):
  • Premium/First bill hundreds inference: if dollars < 20 AND contains either decimal like ".60/.80" OR phrase "and NN¢" OR compact words like "four sixty", treat as hundreds:
      "$5.10 and 56¢"  → 510.56
      "$2.98"          → 298.00
      "$15.50"         → 1550.00
      "four sixty"     → 460.00
      "under $5.50"    → 550.00 (use 550.00 for "under $5.50" in premium/bill context)
  • Enrollment fee inference: Common values are $27.50, $50, $99, $125
      - If raw value appears to be "$0.99" or "$99 cents" → 99.00
      - If raw value is "$1.25" → 125.00 (multiply by 100)
      - Keep $27.50, $50.00, $99.00, $125.00 as-is when already correct
  • Word forms: "one oh five" → 105.00 ; "one hundred twenty five" → 125.00
  • Skip false positives: phone numbers, dates, addresses, percentages, generic values < $10 unless enrollment_fee context.
  • If multiple candidates remain, choose the most recent AGENT mention per conflict order. If still ambiguous, set null.

- Policy details:
  • carrier and plan_type only if they appear in transcript.
  • If agent states a plan type then corrects it later, use the latest correction (e.g., "PPO" then "actually open access" → "Open access").
  • effective_date: parse month/day references to ISO YYYY-MM-DD using the call year from CALL_META, tz America/New_York.
    - Formats to parse: "MM/DD", "M/D", "Month Day", "effective MM/DD", "starts MM/DD"
    - Use current year from call_started_at_iso for the year
    - Only when month and day are explicit; else null

- Reason (≤140 chars): plain-English cause grounded in conversation; avoid advice.
- Summary (≤40 words): objective.
- Red flags: include only from the allowed vocabulary when explicitly expressed; else [].

OUTPUT: single JSON object per schema.

EXAMPLE A (premium compact):
MENTION: field_hint=monthly_premium, value_raw="$5.10 and 56¢"
→ monthly_premium = 510.56

EXAMPLE B (enrollment fee words):
MENTION: field_hint=enrollment_fee, value_raw="one twenty five"
→ enrollment_fee = 125

EXAMPLE C (plan correction):
PLAN_MENTIONS: ["PPO" at pos 1200, "Open access" at pos 3400]
→ policy_details.plan_type = "Open access"

EXAMPLE D (effective date):
Text: "effective November 1"
CALL_META year=2025 → effective_date="2025-11-01"

EXAMPLE E (slash date format):
Text: "this is effective 09/25"
CALL_META year=2025 → effective_date="2025-09-25"`;

const whiteCardSchema = {
  "type": "object",
  "additionalProperties": false,
  "required": ["outcome","monthly_premium","enrollment_fee","reason","summary","customer_name","policy_details","red_flags"],
  "properties": {
    "outcome": {
      "enum": ["sale","no_sale","callback"]
    },
    "monthly_premium": {
      "type": ["number","null"]
    },
    "enrollment_fee": {
      "type": ["number","null"]
    },
    "reason": {
      "type": "string",
      "maxLength": 140
    },
    "summary": {
      "type": "string"
    },
    "customer_name": {
      "type": ["string","null"]
    },
    "policy_details": {
      "type": "object",
      "additionalProperties": false,
      "required": ["carrier","plan_type","effective_date"],
      "properties": {
        "carrier": {
          "type": ["string","null"]
        },
        "plan_type": {
          "type": ["string","null"],
          "enum": ["PPO","HMO","EPO","POS","Medigap","ACA bronze","ACA silver","ACA gold","Short-term","Medicare Advantage","Open access",null]
        },
        "effective_date": {
          "type": ["string","null"],
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
        }
      }
    },
    "red_flags": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
};

export async function analyzeCallSimple(audioUrl: string, meta?: any, settings?: Settings) {
  // Use provided settings or fall back to defaults
  const config = settings || DEFAULTS;

  console.log('Settings being used:', config);

  // Step 1: Get transcript from Deepgram with diarization and entity detection
  console.log('Getting transcript from Deepgram with enhanced features...');

  // Convert Settings.asr to AsrOverrides format
  const asrOverrides: AsrOverrides = {
    model: config.asr.model,
    utt_split: config.asr.utt_split,
    diarize: config.asr.diarize,
    utterances: config.asr.utterances,
    smart_format: config.asr.smart_format,
    punctuate: config.asr.punctuate,
    numerals: config.asr.numerals,
    paragraphs: config.asr.paragraphs,
    detect_entities: config.asr.detect_entities,
    keywords: config.asr.keywords
  };

  const enrichedResult = await transcribeBulk(audioUrl, asrOverrides);

  // Extract segments for rebuttals and metrics
  const segments: Segment[] = enrichedResult.segments;

  // Extract entities
  const entities = enrichedResult.entities || [];

  // Format transcript with speakers
  const formattedTranscript = enrichedResult.formatted;
  const utterances = segments.map(s => ({
    speaker: s.speaker === "agent" ? 0 : 1,
    transcript: s.text
  }));

  console.log(`Transcript ready: ${segments.length} utterances, ${entities.length} entities detected`);
  if (enrichedResult.summary) {
    console.log(`Deepgram summary: ${enrichedResult.summary}`);
  }

  // Step 2: Pass A - Extract mentions with entity augmentation
  console.log('Running Pass A: Extracting mentions...');

  // Build entities context for Pass A
  const entitiesContext = entities.map(e =>
    `[${e.label}] "${e.value}" at ${e.startMs}ms (${e.speaker || 'unknown'})`
  ).join('\n');

  const passAResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: passAPrompt },
      {
        role: "user",
        content: `CALL_META:\n- call_started_at_iso: ${new Date().toISOString()}\n- tz: America/New_York\n\nDEEPGRAM_ENTITIES:\n${entitiesContext || '(none detected)'}\n\nTRANSCRIPT:\n${formattedTranscript}`
      }
    ],
    temperature: 0.1,
    response_format: { type: "json_object" }
  });

  const mentionsTable = JSON.parse(passAResponse.choices[0].message.content || "{}");

  // Augment mentions with Deepgram entities
  augmentMentionsWithEntities(mentionsTable, entities);

  // Add timestamps to all mentions using position-to-timestamp mapping
  addTimestampsToMentions(mentionsTable, segments, formattedTranscript);

  console.log(`Pass A complete: ${mentionsTable.money_mentions?.length || 0} money mentions (${entities.filter(e => e.label === 'money').length} from entities), ${mentionsTable.objection_spans?.length || 0} objections found`);

  // Step 2b: Run rebuttals detection if objections exist
  let rebuttals = null;
  let immediate: any[] = [];
  if (mentionsTable.objection_spans?.length > 0) {
    console.log('Running rebuttals detection...');
    const objectionSpans: ObjectionSpan[] = mentionsTable.objection_spans;

    // Get immediate replies (deterministic, no LLM)
    immediate = buildImmediateReplies(segments, objectionSpans, 15000);

    // Get classified rebuttals (LLM)
    const items = buildAgentSnippetsAroundObjections(segments, objectionSpans);
    rebuttals = await classifyRebuttals(items);
    console.log(`Rebuttals classified: ${rebuttals?.used?.length || 0} addressed, ${rebuttals?.missed?.length || 0} missed`);
  }

  // Step 3: Pass B - Generate final white card
  console.log('Running Pass B: Generating final white card...');

  console.log('=== PASS B INPUT DEBUG ===');
  console.log('Money mentions count:', mentionsTable.money_mentions?.length || 0);
  console.log('Carrier mentions count:', mentionsTable.carrier_mentions?.length || 0);
  console.log('Objection spans count:', mentionsTable.objection_spans?.length || 0);
  console.log('First money mention:', JSON.stringify(mentionsTable.money_mentions?.[0], null, 2));
  console.log('First carrier mention:', JSON.stringify(mentionsTable.carrier_mentions?.[0], null, 2));

  const passBResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: passBPrompt },
      {
        role: "user",
        content: `CALL_META:\n- call_started_at_iso: ${new Date().toISOString()}\n- tz: America/New_York\n\nMENTIONS_TABLE:\n${JSON.stringify(mentionsTable, null, 2)}\n\nTRANSCRIPT:\n${formattedTranscript}`
      }
    ],
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "WhiteCard",
        schema: whiteCardSchema,
        strict: true
      }
    }
  });

  const analysis = JSON.parse(passBResponse.choices[0].message.content || "{}");

  console.log('=== PASS B DEBUG ===');
  console.log('Raw Pass B response:', passBResponse.choices[0].message.content);
  console.log('Parsed analysis:', JSON.stringify(analysis, null, 2));
  console.log('Mentions table passed to Pass B had money_mentions:', mentionsTable.money_mentions?.length || 0);
  console.log('Mentions table passed to Pass B had carrier_mentions:', mentionsTable.carrier_mentions?.length || 0);

  // Step 3b: Apply deterministic money normalization
  // Store both raw and normalized values for auditing
  const rawMonthlyPremium = analysis.monthly_premium;
  const rawEnrollmentFee = analysis.enrollment_fee;

  if (mentionsTable.money_mentions?.length > 0) {
    // Find the most recent/relevant money mentions for each field
    const premiumMention = mentionsTable.money_mentions.find((m: any) =>
      m.field_hint === 'monthly_premium' || m.field_hint === 'first_month_bill'
    );
    const enrollmentMention = mentionsTable.money_mentions.find((m: any) =>
      m.field_hint === 'enrollment_fee'
    );

    // Apply normalization if we have values to normalize
    if (analysis.monthly_premium !== null && premiumMention) {
      const context: MoneyContext = premiumMention.field_hint === 'monthly_premium' ? 'monthly_premium' : 'first_month_bill';
      analysis.monthly_premium = normalizeMoney(
        analysis.monthly_premium,
        context,
        premiumMention.quote || premiumMention.value_raw
      );
    }

    if (analysis.enrollment_fee !== null && enrollmentMention) {
      analysis.enrollment_fee = normalizeMoney(
        analysis.enrollment_fee,
        'enrollment_fee',
        enrollmentMention.quote || enrollmentMention.value_raw
      );
    }
  }

  // Also normalize prices found in carrier mentions
  if (mentionsTable.carrier_mentions?.length > 0) {
    mentionsTable.carrier_mentions = mentionsTable.carrier_mentions.map((carrier: any) => {
      const quote = carrier.quote || '';
      // Look for price patterns in carrier quotes
      const priceMatch = quote.match(/\$(\d+(?:\.\d{2})?)/);
      if (priceMatch) {
        const rawPrice = parseFloat(priceMatch[1]);
        // Apply same normalization rules as monthly premium for carrier prices
        if (rawPrice < 50) {
          const normalizedPrice = rawPrice * 100;
          // Update the quote with normalized price
          carrier.normalized_quote = quote.replace(priceMatch[0], `$${normalizedPrice.toFixed(2)}`);
          carrier.price_normalized = true;
          carrier.raw_price = rawPrice;
          carrier.normalized_price = normalizedPrice;
        }
      }
      return carrier;
    });
  }

  // Compute deterministic talk metrics from diarized segments
  const talk_metrics = segments && segments.length > 0
    ? computeTalkMetrics(segments)
    : { talk_time_agent_sec: 0, talk_time_customer_sec: 0, silence_time_sec: 0, interrupt_count: 0 };

  // Prepare entities summary
  const entitiesSummary = summarizeEntities(entities);

  // List enabled Deepgram features
  const dgFeatures = [
    'smart_format',
    'utterances (utt_split=1.1)',
    'diarize',
    'detect_entities',
    'punctuate',
    'numerals',
    'paragraphs'
  ];

  // Step 4: Return combined result
  return {
    transcript: formattedTranscript,
    utterance_count: utterances.length,
    duration: enrichedResult.duration || 0,
    deepgram_summary: enrichedResult.summary,
    mentions_table: mentionsTable,  // Include Pass A results for debugging
    analysis: {
      ...analysis,
      agent_name: meta?.agent_name || null,
      agent_id: meta?.agent_id || null
    },
    rebuttals: rebuttals ? {
      ...rebuttals,
      immediate: immediate
    } : null,  // Include rebuttals with immediate responses if detected
    talk_metrics,
    dg_features: dgFeatures,  // New field: list of enabled Deepgram features
    entities_summary: entitiesSummary,  // New field: summary of detected entities
    metadata: {
      model: "two-pass-v1",
      deepgram_request_id: enrichedResult.requestId,
      processed_at: new Date().toISOString(),
      agent_name: meta?.agent_name || null,
      agent_id: meta?.agent_id || null,
      normalization_applied: {
        monthly_premium: rawMonthlyPremium !== analysis.monthly_premium ? {
          raw: rawMonthlyPremium,
          normalized: analysis.monthly_premium
        } : null,
        enrollment_fee: rawEnrollmentFee !== analysis.enrollment_fee ? {
          raw: rawEnrollmentFee,
          normalized: analysis.enrollment_fee
        } : null
      }
    }
  };
}

/**
 * Convert character position to timestamp using segments
 */
function positionToTimestamp(position: number, segments: Segment[], formattedTranscript: string): number | null {
  if (!segments || segments.length === 0 || position < 0) return null;

  // Build a cumulative character offset map for each segment
  let charOffset = 0;
  for (const segment of segments) {
    const segmentText = `Speaker ${segment.speaker === 'agent' ? '0' : '1'}: ${segment.text}\n\n`;
    const segmentLength = segmentText.length;

    // If position falls within this segment, return its start timestamp
    if (position >= charOffset && position < charOffset + segmentLength) {
      return segment.startMs;
    }

    charOffset += segmentLength;
  }

  // If position is beyond all segments, return the last segment's end time
  return segments[segments.length - 1]?.endMs || null;
}

/**
 * Augment mentions with timestamps from positions
 */
function addTimestampsToMentions(mentions: any, segments: Segment[], formattedTranscript: string) {
  // Add timestamps to money mentions
  if (mentions.money_mentions) {
    for (const mention of mentions.money_mentions) {
      if (!mention.timestamp_ms && mention.position) {
        mention.timestamp_ms = positionToTimestamp(mention.position, segments, formattedTranscript);
      }
    }
  }

  // Add timestamps to carrier mentions
  if (mentions.carrier_mentions) {
    for (const mention of mentions.carrier_mentions) {
      if (!mention.timestamp_ms && mention.position) {
        mention.timestamp_ms = positionToTimestamp(mention.position, segments, formattedTranscript);
      }
    }
  }

  // Add timestamps to date mentions
  if (mentions.date_mentions) {
    for (const mention of mentions.date_mentions) {
      if (!mention.timestamp_ms && mention.position) {
        mention.timestamp_ms = positionToTimestamp(mention.position, segments, formattedTranscript);
      }
    }
  }

  // Add timestamps to objection spans
  if (mentions.objection_spans) {
    for (const objection of mentions.objection_spans) {
      if ((!objection.startMs || objection.startMs === 0) && objection.position) {
        const ts = positionToTimestamp(objection.position, segments, formattedTranscript);
        objection.startMs = ts || 0;
        objection.endMs = ts ? ts + 2000 : 0; // Assume 2 second duration for objections
      }
    }
  }
}

/**
 * Augment mentions with Deepgram entities
 */
function augmentMentionsWithEntities(mentions: any, entities: Entity[]) {
  // Add money entities with timestamps
  const moneyEntities = entities.filter(e => e.label === 'money');
  for (const entity of moneyEntities) {
    const exists = mentions.money_mentions?.some((m: any) =>
      m.quote?.includes(entity.value) || m.value_raw?.includes(entity.value)
    );

    if (!exists) {
      mentions.money_mentions = mentions.money_mentions || [];
      mentions.money_mentions.push({
        field_hint: 'generic',
        value_raw: entity.value,
        quote: entity.value,
        position: 0,
        speaker: entity.speaker || 'unknown',
        source: 'deepgram_entity',
        timestamp_ms: entity.startMs
      });
    }
  }

  // Add organization entities as potential carriers with timestamps
  const orgEntities = entities.filter(e => e.label === 'organization');
  for (const entity of orgEntities) {
    const exists = mentions.carrier_mentions?.some((c: any) =>
      c.carrier === entity.value || c.quote?.includes(entity.value)
    );

    if (!exists) {
      mentions.carrier_mentions = mentions.carrier_mentions || [];
      mentions.carrier_mentions.push({
        carrier: entity.value,
        quote: entity.value,
        position: 0,
        source: 'deepgram_entity',
        timestamp_ms: entity.startMs
      });
    }
  }

  // Add date entities with timestamps
  const dateEntities = entities.filter(e => e.label === 'date');
  for (const entity of dateEntities) {
    const exists = mentions.date_mentions?.some((d: any) =>
      d.value_raw === entity.value || d.quote?.includes(entity.value)
    );

    if (!exists) {
      mentions.date_mentions = mentions.date_mentions || [];
      mentions.date_mentions.push({
        kind: 'generic',
        value_raw: entity.value,
        quote: entity.value,
        position: 0,
        source: 'deepgram_entity',
        timestamp_ms: entity.startMs
      });
    }
  }
}

/**
 * Summarize detected entities by type
 */
function summarizeEntities(entities: Entity[]) {
  const summary: Record<string, number> = {};

  for (const entity of entities) {
    summary[entity.label] = (summary[entity.label] || 0) + 1;
  }

  return summary;
}