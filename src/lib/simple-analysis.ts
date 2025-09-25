import { createClient } from "@deepgram/sdk";
import OpenAI from "openai";
import { buildAgentSnippetsAroundObjections, classifyRebuttals, buildImmediateReplies, type Segment, type ObjectionSpan } from "./rebuttals";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);
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
  • Premium/First bill hundreds inference: if dollars < 50 AND contains either decimal like ".60/.80" OR phrase "and NN¢" OR compact words like "four sixty", treat as hundreds:
      "$5.10 and 56¢"  → 510.56
      "four sixty"     → 460.00
      "under $5.50"    → 550.00 (use 550.00 for "under $5.50" in premium/bill context)
  • Enrollment fee hundreds inference: if enrollment_fee < 10 → multiply by 100 (e.g., "$1.25" → 125.00) when context is enrollment fee.
  • Word forms: "one oh five" → 105.00 ; "one hundred twenty five" → 125.00
  • Skip false positives: phone numbers, dates, addresses, percentages, generic values < $10 unless enrollment_fee context.
  • If multiple candidates remain, choose the most recent AGENT mention per conflict order. If still ambiguous, set null.

- Policy details:
  • carrier and plan_type only if they appear in transcript.
  • If agent states a plan type then corrects it later, use the latest correction (e.g., "PPO" then "actually open access" → "Open access").
  • effective_date: parse month/day references to ISO YYYY-MM-DD using the call year from CALL_META, tz America/New_York. Only when month and day are explicit; else null.

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
CALL_META year=2025 → effective_date="2025-11-01"`;

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

export async function analyzeCallSimple(audioUrl: string, meta?: any) {
  // Step 1: Get transcript from Deepgram with diarization
  console.log('Getting transcript from Deepgram...');

  const { result } = await deepgram.listen.prerecorded.transcribeUrl(
    { url: audioUrl },
    {
      model: "nova-2",
      language: "en",
      summarize: "v2",
      smart_format: true,
      punctuate: true,
      utterances: true,
      diarize: true,
    }
  );

  // Extract utterances with speakers and segments for rebuttals
  const utterances = result?.results?.utterances || [];

  // Extract segments with millisecond timestamps for rebuttals
  const segments: Segment[] = utterances.map(u => ({
    speaker: u.speaker === 0 ? "agent" : "customer",
    startMs: Math.round((u.start || 0) * 1000),
    endMs: Math.round((u.end || 0) * 1000),
    text: u.transcript || "",
    conf: u.confidence || 0
  }));

  // Extract summary if available (from summarize: v2)
  const deepgramSummary = result?.results?.summary?.short || null;

  // Format transcript with speakers
  const formattedTranscript = utterances.map(u =>
    `Speaker ${u.speaker}: ${u.transcript}`
  ).join('\n\n');

  console.log(`Transcript ready: ${utterances.length} utterances`);
  if (deepgramSummary) {
    console.log(`Deepgram summary: ${deepgramSummary}`);
  }

  // Step 2: Pass A - Extract mentions
  console.log('Running Pass A: Extracting mentions...');

  const passAResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: passAPrompt },
      {
        role: "user",
        content: `CALL_META:\n- call_started_at_iso: ${new Date().toISOString()}\n- tz: America/New_York\n\nTRANSCRIPT:\n${formattedTranscript}`
      }
    ],
    temperature: 0.1,
    response_format: { type: "json_object" }
  });

  const mentionsTable = JSON.parse(passAResponse.choices[0].message.content || "{}");
  console.log(`Pass A complete: ${mentionsTable.money_mentions?.length || 0} money mentions, ${mentionsTable.objection_spans?.length || 0} objections found`);

  // Step 2b: Run rebuttals detection if objections exist
  let rebuttals = null;
  let immediate = [];
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

  // Step 4: Return combined result
  return {
    transcript: formattedTranscript,
    utterance_count: utterances.length,
    duration: result?.results?.channels?.[0]?.alternatives?.[0]?.words?.slice(-1)[0]?.end || 0,
    deepgram_summary: deepgramSummary,
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
    metadata: {
      model: "two-pass-v1",
      deepgram_request_id: result?.metadata?.request_id,
      processed_at: new Date().toISOString(),
      agent_name: meta?.agent_name || null,
      agent_id: meta?.agent_id || null
    }
  };
}