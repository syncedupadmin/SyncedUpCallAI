/**
 * Unified Analysis V2 - 3-Pass Sequential Architecture
 *
 * Research-backed approach using OpenAI structured outputs (strict: true) for 100% reliability
 *
 * PASS 1: Comprehensive Extraction (GPT-4o-mini)
 *   - Extract all mentions (money, carrier, plan, dates)
 *   - Extract opening segment (0-30s)
 *   - Extract post-close segment (after card collection)
 *   - Detect objections for rebuttal analysis
 *
 * PASS 2: Opening & Post-Close Analysis (GPT-4o-mini)
 *   - Analyze opening quality (greeting, pace, control)
 *   - Detect rejection patterns and rebuttal quality
 *   - Verify post-close script compliance (if active script exists)
 *   - Fuzzy match against master script
 *
 * PASS 3: Final White Card (GPT-4o)
 *   - Generate outcome with FULL context (opening + compliance)
 *   - Normalize money values
 *   - Extract policy details
 *   - Create comprehensive summary referencing opening/compliance
 */

import OpenAI from "openai";
import { transcribeBulk, type Segment, type AsrOverrides } from "./asr-nova2";
import { computeTalkMetrics } from "./talk-metrics";
import { buildAgentSnippetsAroundObjections, classifyRebuttals, type ObjectionSpan } from "./rebuttals";
import { analyzeCompliance as analyzePostCloseCompliance, getActiveScript } from "./post-close-analysis";
import { logInfo, logError } from './log';
import type { Settings } from "@/config/asr-analysis";
import { DEFAULTS } from "@/config/asr-analysis";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ============================================
// JSON SCHEMAS (Structured Outputs - Strict Mode)
// ============================================

/**
 * Pass 1 Schema: Comprehensive Extraction
 */
const pass1Schema = {
  "type": "object",
  "required": [
    "money_mentions",
    "plan_mentions",
    "carrier_mentions",
    "date_mentions",
    "signals",
    "objection_spans",
    "opening_segment",
    "post_close_segment"
  ],
  "additionalProperties": false,
  "properties": {
    "money_mentions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["field_hint", "value_raw", "quote", "position", "speaker"],
        "additionalProperties": false,
        "properties": {
          "field_hint": {
            "type": "string",
            "enum": ["monthly_premium", "first_month_bill", "enrollment_fee", "generic"]
          },
          "value_raw": { "type": "string" },
          "quote": { "type": "string", "maxLength": 160 },
          "position": { "type": "integer" },
          "speaker": {
            "type": "string",
            "enum": ["agent", "customer", "unknown"]
          }
        }
      }
    },
    "plan_mentions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["plan_type", "quote", "position"],
        "additionalProperties": false,
        "properties": {
          "plan_type": {
            "type": "string",
            "enum": ["PPO", "HMO", "EPO", "POS", "Medigap", "ACA bronze", "ACA silver", "ACA gold", "Short-term", "Medicare Advantage", "Open access"]
          },
          "quote": { "type": "string", "maxLength": 160 },
          "position": { "type": "integer" }
        }
      }
    },
    "carrier_mentions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["carrier", "quote", "position"],
        "additionalProperties": false,
        "properties": {
          "carrier": { "type": "string" },
          "quote": { "type": "string", "maxLength": 160 },
          "position": { "type": "integer" }
        }
      }
    },
    "date_mentions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["kind", "value_raw", "quote", "position"],
        "additionalProperties": false,
        "properties": {
          "kind": {
            "type": "string",
            "enum": ["effective_date", "post_date", "generic"]
          },
          "value_raw": { "type": "string" },
          "quote": { "type": "string", "maxLength": 160 },
          "position": { "type": "integer" }
        }
      }
    },
    "signals": {
      "type": "object",
      "required": ["sale_cues", "callback_cues", "red_flags_raw"],
      "additionalProperties": false,
      "properties": {
        "sale_cues": {
          "type": "array",
          "items": { "type": "string" }
        },
        "callback_cues": {
          "type": "array",
          "items": { "type": "string" }
        },
        "red_flags_raw": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["dnc_request", "trust_scam_fear", "bank_decline", "language_barrier", "benefits_confusion", "requested_cancel"]
          }
        }
      }
    },
    "objection_spans": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["stall_type", "quote", "position", "startMs", "endMs", "speaker"],
        "additionalProperties": false,
        "properties": {
          "stall_type": {
            "type": "string",
            "enum": ["pricing", "spouse_approval", "bank_decline", "benefits_confusion", "trust_scam_fear", "already_covered", "agent_miscommunication", "requested_callback", "language_barrier", "other"]
          },
          "quote": { "type": "string", "maxLength": 160 },
          "position": { "type": "integer" },
          "startMs": { "type": "integer" },
          "endMs": { "type": "integer" },
          "speaker": {
            "type": "string",
            "enum": ["customer"]
          }
        }
      }
    },
    "opening_segment": {
      "type": "object",
      "required": ["text", "start_ms", "end_ms", "duration_sec"],
      "additionalProperties": false,
      "properties": {
        "text": { "type": "string" },
        "start_ms": { "type": "integer" },
        "end_ms": { "type": "integer" },
        "duration_sec": { "type": "integer" }
      }
    },
    "post_close_segment": {
      "type": "object",
      "required": ["text", "start_ms", "end_ms", "detected_after_card", "card_timestamp_ms"],
      "additionalProperties": false,
      "properties": {
        "text": { "type": "string" },
        "start_ms": { "type": "integer" },
        "end_ms": { "type": "integer" },
        "detected_after_card": { "type": "boolean" },
        "card_timestamp_ms": {
          "type": ["integer", "null"]
        }
      }
    }
  }
};

/**
 * Pass 2 Schema: Opening & Post-Close Analysis
 */
const pass2Schema = {
  "type": "object",
  "required": ["opening_analysis", "post_close_initial"],
  "additionalProperties": false,
  "properties": {
    "opening_analysis": {
      "type": "object",
      "required": [
        "opening_score",
        "control_score",
        "greeting_type",
        "pace_wpm",
        "company_mentioned",
        "agent_name_mentioned",
        "value_prop_mentioned",
        "question_asked",
        "rejection_detected",
        "rejection_type",
        "rebuttal_attempted",
        "rebuttal_quality",
        "led_to_pitch",
        "opening_feedback"
      ],
      "additionalProperties": false,
      "properties": {
        "opening_score": { "type": "integer", "minimum": 0, "maximum": 100 },
        "control_score": { "type": "integer", "minimum": 0, "maximum": 100 },
        "greeting_type": {
          "type": "string",
          "enum": ["professional", "casual", "assumptive", "weak", "none"]
        },
        "pace_wpm": { "type": "integer" },
        "company_mentioned": { "type": "boolean" },
        "agent_name_mentioned": { "type": "boolean" },
        "value_prop_mentioned": { "type": "boolean" },
        "question_asked": { "type": "boolean" },
        "rejection_detected": { "type": "boolean" },
        "rejection_type": {
          "type": ["string", "null"],
          "enum": ["immediate_hangup", "not_interested", "dnc_request", "existing_coverage", "pricing_objection", null]
        },
        "rebuttal_attempted": { "type": "boolean" },
        "rebuttal_quality": {
          "type": ["string", "null"],
          "enum": ["effective", "weak", "none", null]
        },
        "led_to_pitch": { "type": "boolean" },
        "opening_feedback": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "post_close_initial": {
      "type": "object",
      "required": ["detected", "segment_quality", "contains_disclosures", "disclosure_keywords"],
      "additionalProperties": false,
      "properties": {
        "detected": { "type": "boolean" },
        "segment_quality": {
          "type": "string",
          "enum": ["clear", "partial", "missing", "no_sale"]
        },
        "contains_disclosures": { "type": "boolean" },
        "disclosure_keywords": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
};

/**
 * Pass 3 Schema: Final White Card
 */
const pass3Schema = {
  "type": "object",
  "required": [
    "outcome",
    "monthly_premium",
    "enrollment_fee",
    "reason",
    "summary",
    "customer_name",
    "policy_details",
    "red_flags",
    "opening_quality",
    "compliance_status"
  ],
  "additionalProperties": false,
  "properties": {
    "outcome": {
      "type": "string",
      "enum": ["sale", "no_sale", "callback"]
    },
    "monthly_premium": {
      "type": ["number", "null"]
    },
    "enrollment_fee": {
      "type": ["number", "null"]
    },
    "reason": {
      "type": "string",
      "maxLength": 140
    },
    "summary": {
      "type": "string"
    },
    "customer_name": {
      "type": ["string", "null"]
    },
    "policy_details": {
      "type": "object",
      "required": ["carrier", "plan_type", "effective_date"],
      "additionalProperties": false,
      "properties": {
        "carrier": { "type": ["string", "null"] },
        "plan_type": {
          "type": ["string", "null"],
          "enum": ["PPO", "HMO", "EPO", "POS", "Medigap", "ACA bronze", "ACA silver", "ACA gold", "Short-term", "Medicare Advantage", "Open access", null]
        },
        "effective_date": {
          "type": ["string", "null"],
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
        }
      }
    },
    "red_flags": {
      "type": "array",
      "items": { "type": "string" }
    },
    "opening_quality": {
      "type": "string",
      "enum": ["excellent", "good", "needs_improvement", "poor"]
    },
    "compliance_status": {
      "type": "string",
      "enum": ["passed", "failed", "partial", "no_sale", "not_applicable"]
    }
  }
};

// ============================================
// PASS 1: COMPREHENSIVE EXTRACTION
// ============================================

const pass1Prompt = `You extract structured data from U.S. health-insurance sales call transcripts.

Return STRICT JSON ONLY matching the schema. Do not infer, summarize, or normalize. Redact 7+ consecutive digits as #######. When unsure, omit. Positions are character offsets.

EXTRACT:
1. money_mentions - All money references (monthly_premium, first_month_bill, enrollment_fee, generic)
2. plan_mentions - Plan types (PPO, HMO, etc.) verbatim from transcript
3. carrier_mentions - Insurance carriers mentioned
4. date_mentions - All dates (effective_date, post_date, generic)
5. signals - sale_cues, callback_cues, red_flags_raw
6. objection_spans - Customer objections with timestamps
7. opening_segment - First 30 seconds (or up to first objection/rejection)
8. post_close_segment - Segment AFTER card collection (detect "card", "payment", "process", etc.)

OPENING SEGMENT RULES:
- Extract first 0-30 seconds of call
- If rejection/objection occurs before 30s, stop at that point
- Include timestamps (start_ms, end_ms)

POST-CLOSE SEGMENT RULES:
- Detect card collection keywords: "card number", "credit card", "debit card", "payment information", "last four"
- Extract everything AFTER first card mention
- Set detected_after_card=true if card detected, false otherwise
- If card not detected but call is sale, extract last 60 seconds

OUTPUT: JSON object only.`;

async function extractComprehensiveWithSegments(
  audioUrl: string,
  meta?: any,
  settings?: Settings
): Promise<any> {
  const config = settings || DEFAULTS;
  const pass1StartTime = Date.now();

  logInfo({ event_type: 'pass1_extraction_started', audio_url: audioUrl });

  // Get transcript with diarization
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

  const deepgramStartTime = Date.now();
  const enrichedResult = await transcribeBulk(audioUrl, asrOverrides);
  const deepgramDuration = Date.now() - deepgramStartTime;
  const segments: Segment[] = enrichedResult.segments;
  const formattedTranscript = enrichedResult.formatted;
  const entities = enrichedResult.entities || [];

  // Build entities context
  const entitiesContext = entities.map(e =>
    `[${e.label}] "${e.value}" at ${e.startMs}ms (${e.speaker || 'unknown'})`
  ).join('\n');

  // Call Pass 1 with structured output
  const openaiPass1StartTime = Date.now();
  const pass1Response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: pass1Prompt },
      {
        role: "user",
        content: `CALL_META:\n- call_started_at_iso: ${new Date().toISOString()}\n- tz: America/New_York\n- duration_sec: ${meta?.duration_sec || 0}\n\nDEEPGRAM_ENTITIES:\n${entitiesContext || '(none)'}\n\nTRANSCRIPT:\n${formattedTranscript}`
      }
    ],
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "Pass1Extraction",
        schema: pass1Schema,
        strict: true
      }
    }
  });
  const openaiPass1Duration = Date.now() - openaiPass1StartTime;

  const extracted = JSON.parse(pass1Response.choices[0].message.content || "{}");
  const pass1TotalDuration = Date.now() - pass1StartTime;

  logInfo({
    event_type: 'pass1_extraction_complete',
    money_mentions: extracted.money_mentions?.length || 0,
    objections: extracted.objection_spans?.length || 0,
    opening_segment_duration: extracted.opening_segment?.duration_sec || 0,
    post_close_detected: extracted.post_close_segment?.detected_after_card || false,
    timing_deepgram_ms: deepgramDuration,
    timing_openai_ms: openaiPass1Duration,
    timing_total_ms: pass1TotalDuration,
    tokens_input: pass1Response.usage?.prompt_tokens || 0,
    tokens_output: pass1Response.usage?.completion_tokens || 0
  });

  return {
    extracted,
    segments,
    formattedTranscript,
    entities,
    duration: enrichedResult.duration || 0,
    deepgram_summary: enrichedResult.summary,
    timing: {
      deepgram_ms: deepgramDuration,
      openai_pass1_ms: openaiPass1Duration,
      total_ms: pass1TotalDuration
    },
    tokens: {
      pass1_input: pass1Response.usage?.prompt_tokens || 0,
      pass1_output: pass1Response.usage?.completion_tokens || 0
    }
  };
}

// ============================================
// PASS 2: OPENING & POST-CLOSE ANALYSIS
// ============================================

const pass2Prompt = `You analyze the opening and post-close segments of health insurance sales calls.

OPENING ANALYSIS:
- Rate opening quality (0-100): greeting, pace, professionalism
- Rate control score (0-100): agent maintains conversation flow
- Classify greeting: professional, casual, assumptive, weak, none
- Calculate pace in words per minute
- Check if company name mentioned
- Check if agent name mentioned
- Check if value proposition stated
- Check if qualifying question asked
- Detect early rejection/objection
- If rejection detected, assess rebuttal quality
- Determine if call progressed to pitch despite rejection

OPENING BEST PRACTICES:
- Professional greeting with company name
- Agent introduces themselves by name
- Clear value proposition ("I can help you find affordable coverage")
- Control pacing (140-160 WPM ideal for sales)
- Ask qualifying questions early
- Handle rejections with confidence
- Transition smoothly to pitch

POST-CLOSE INITIAL ASSESSMENT:
- Confirm segment exists and quality (clear/partial/missing)
- Detect disclosure keywords: "terms", "conditions", "underwriting", "policy", "agreement", "authorize"
- If no sale, set segment_quality to "no_sale"

Return strict JSON matching schema.`;

async function analyzeOpeningAndCompliance(
  pass1Result: any,
  formattedTranscript: string,
  meta?: any
): Promise<any> {
  const pass2StartTime = Date.now();
  logInfo({ event_type: 'pass2_analysis_started' });

  const { extracted, segments } = pass1Result;
  const openingSegment = extracted.opening_segment;
  const postCloseSegment = extracted.post_close_segment;

  // Call Pass 2 with structured output
  const openaiPass2StartTime = Date.now();
  const pass2Response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: pass2Prompt },
      {
        role: "user",
        content: `OPENING SEGMENT (${openingSegment.duration_sec}s):\n${openingSegment.text}\n\nPOST-CLOSE SEGMENT:\nDetected after card: ${postCloseSegment.detected_after_card}\n${postCloseSegment.text || '(no post-close segment)'}\n\nFULL CONTEXT (if needed):\n${formattedTranscript.substring(0, 3000)}`
      }
    ],
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "Pass2Analysis",
        schema: pass2Schema,
        strict: true
      }
    }
  });
  const openaiPass2Duration = Date.now() - openaiPass2StartTime;

  const pass2Data = JSON.parse(pass2Response.choices[0].message.content || "{}");

  // Run post-close compliance analysis if segment detected and active script exists
  let complianceResult = null;
  let complianceDuration = 0;
  if (postCloseSegment.detected_after_card && pass2Data.post_close_initial.detected) {
    try {
      // Check for active script
      const complianceStartTime = Date.now();
      const activeScript = await getActiveScript();
      if (activeScript) {
        logInfo({ event_type: 'post_close_compliance_started', script_id: activeScript.id });

        complianceResult = await analyzePostCloseCompliance(
          formattedTranscript,
          activeScript.id
        );
        complianceDuration = Date.now() - complianceStartTime;

        logInfo({
          event_type: 'post_close_compliance_complete',
          overall_score: complianceResult?.overall_score || 0,
          compliance_passed: complianceResult?.compliance_passed || false,
          timing_ms: complianceDuration
        });
      } else {
        logInfo({ event_type: 'post_close_no_active_script' });
      }
    } catch (error) {
      logError('post_close_compliance_error', error, { event_type: 'post_close_compliance_error' });
    }
  }

  const pass2TotalDuration = Date.now() - pass2StartTime;

  logInfo({
    event_type: 'pass2_analysis_complete',
    opening_score: pass2Data.opening_analysis.opening_score,
    rejection_detected: pass2Data.opening_analysis.rejection_detected,
    compliance_checked: !!complianceResult,
    timing_openai_ms: openaiPass2Duration,
    timing_compliance_ms: complianceDuration,
    timing_total_ms: pass2TotalDuration,
    tokens_input: pass2Response.usage?.prompt_tokens || 0,
    tokens_output: pass2Response.usage?.completion_tokens || 0
  });

  return {
    ...pass2Data,
    post_close_compliance: complianceResult,
    timing: {
      openai_pass2_ms: openaiPass2Duration,
      compliance_ms: complianceDuration,
      total_ms: pass2TotalDuration
    },
    tokens: {
      pass2_input: pass2Response.usage?.prompt_tokens || 0,
      pass2_output: pass2Response.usage?.completion_tokens || 0
    }
  };
}

// ============================================
// PASS 3: FINAL WHITE CARD
// ============================================

const pass3Prompt = `You generate the final analysis white card for health insurance sales calls.

You have FULL CONTEXT from previous analysis passes:
- Pass 1: Extracted money, plans, carriers, dates, objections
- Pass 2: Opening quality analysis and post-close compliance check

Your task:
1. Determine final outcome (sale/no_sale/callback)
2. Normalize money values (monthly_premium, enrollment_fee) as numbers
3. Extract policy details (carrier, plan_type, effective_date YYYY-MM-DD)
4. Generate concise reason for outcome (max 140 chars)
5. Create comprehensive summary that REFERENCES:
   - Opening quality ("Agent had [excellent/good/poor] opening with [score]/100")
   - Compliance status ("Post-close compliance [passed/failed/not_applicable]")
   - Key objections and how they were handled
   - Final outcome and why
6. Extract customer name if mentioned
7. List red flags (from Pass 1 + any additional)
8. Classify opening_quality: excellent (90+), good (70-89), needs_improvement (50-69), poor (<50)
9. Classify compliance_status: passed, failed, partial, no_sale, not_applicable

MONEY NORMALIZATION:
- "eighty-nine dollars" → 89
- "$142.50" → 142.50
- "one forty-two fifty" → 142.50
- If multiple mentions, use most reliable (agent-stated > customer-stated)

COMPLIANCE STATUS RULES:
- passed: compliance_score >= 80
- partial: compliance_score 50-79
- failed: compliance_score < 50
- no_sale: outcome is not "sale"
- not_applicable: no active script or segment not detected

Return strict JSON matching schema.`;

async function generateFinalWhiteCard(
  pass1Result: any,
  pass2Result: any,
  formattedTranscript: string
): Promise<any> {
  const pass3StartTime = Date.now();
  logInfo({ event_type: 'pass3_white_card_started' });

  const { extracted } = pass1Result;
  const { opening_analysis, post_close_compliance } = pass2Result;

  // Build context for Pass 3
  const contextSummary = {
    pass1_extracted: {
      money_mentions: extracted.money_mentions,
      plan_mentions: extracted.plan_mentions,
      carrier_mentions: extracted.carrier_mentions,
      date_mentions: extracted.date_mentions,
      signals: extracted.signals,
      objection_count: extracted.objection_spans.length
    },
    pass2_opening: {
      opening_score: opening_analysis.opening_score,
      control_score: opening_analysis.control_score,
      greeting_type: opening_analysis.greeting_type,
      rejection_detected: opening_analysis.rejection_detected,
      led_to_pitch: opening_analysis.led_to_pitch
    },
    pass2_compliance: post_close_compliance ? {
      overall_score: post_close_compliance.overall_score,
      compliance_passed: post_close_compliance.compliance_passed,
      word_match_percentage: post_close_compliance.word_match_percentage,
      missing_phrases_count: post_close_compliance.missing_phrases?.length || 0
    } : null
  };

  // Call Pass 3 with structured output
  const openaiPass3StartTime = Date.now();
  const pass3Response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: pass3Prompt },
      {
        role: "user",
        content: `CONTEXT FROM PREVIOUS PASSES:\n${JSON.stringify(contextSummary, null, 2)}\n\nTRANSCRIPT:\n${formattedTranscript}`
      }
    ],
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "Pass3WhiteCard",
        schema: pass3Schema,
        strict: true
      }
    }
  });
  const openaiPass3Duration = Date.now() - openaiPass3StartTime;

  const whiteCard = JSON.parse(pass3Response.choices[0].message.content || "{}");
  const pass3TotalDuration = Date.now() - pass3StartTime;

  logInfo({
    event_type: 'pass3_white_card_complete',
    outcome: whiteCard.outcome,
    opening_quality: whiteCard.opening_quality,
    compliance_status: whiteCard.compliance_status,
    timing_openai_ms: openaiPass3Duration,
    timing_total_ms: pass3TotalDuration,
    tokens_input: pass3Response.usage?.prompt_tokens || 0,
    tokens_output: pass3Response.usage?.completion_tokens || 0
  });

  return {
    ...whiteCard,
    timing: {
      openai_pass3_ms: openaiPass3Duration,
      total_ms: pass3TotalDuration
    },
    tokens: {
      pass3_input: pass3Response.usage?.prompt_tokens || 0,
      pass3_output: pass3Response.usage?.completion_tokens || 0
    }
  };
}

// ============================================
// MAIN ORCHESTRATOR: 3-PASS SEQUENTIAL
// ============================================

export async function analyzeCallV2(
  audioUrl: string,
  meta?: any,
  settings?: Settings
) {
  const startTime = Date.now();
  logInfo({ event_type: 'analyze_v2_started', audio_url: audioUrl });

  try {
    // PASS 1: Comprehensive Extraction
    const pass1Result = await extractComprehensiveWithSegments(audioUrl, meta, settings);

    // PASS 2: Opening & Post-Close Analysis
    const pass2Result = await analyzeOpeningAndCompliance(pass1Result, pass1Result.formattedTranscript, meta);

    // PASS 3: Final White Card
    const whiteCard = await generateFinalWhiteCard(pass1Result, pass2Result, pass1Result.formattedTranscript);

    // Compute talk metrics
    const talkMetrics = computeTalkMetrics(pass1Result.segments);

    // Rebuttal analysis (if objections detected)
    let rebuttalAnalysis = null;
    if (pass1Result.extracted.objection_spans.length > 0) {
      const objectionSpans: ObjectionSpan[] = pass1Result.extracted.objection_spans.map((o: any) => ({
        stall_type: o.stall_type,
        quote: o.quote,
        position: o.position,
        startMs: o.startMs,
        endMs: o.endMs,
        speaker: o.speaker
      }));

      const agentSnippets = buildAgentSnippetsAroundObjections(pass1Result.segments, objectionSpans);
      const rebuttalClassifications = await classifyRebuttals(agentSnippets);

      rebuttalAnalysis = {
        objections: objectionSpans,
        agent_responses: agentSnippets,
        classifications: rebuttalClassifications
      };
    }

    const duration = Date.now() - startTime;

    // Aggregate all timing data
    const timingData = {
      deepgram_ms: pass1Result.timing?.deepgram_ms || 0,
      openai_pass1_ms: pass1Result.timing?.openai_pass1_ms || 0,
      openai_pass2_ms: pass2Result.timing?.openai_pass2_ms || 0,
      compliance_ms: pass2Result.timing?.compliance_ms || 0,
      openai_pass3_ms: whiteCard.timing?.openai_pass3_ms || 0,
      total_ms: duration
    };

    // Aggregate all token usage
    const tokenData = {
      pass1_input: pass1Result.tokens?.pass1_input || 0,
      pass1_output: pass1Result.tokens?.pass1_output || 0,
      pass2_input: pass2Result.tokens?.pass2_input || 0,
      pass2_output: pass2Result.tokens?.pass2_output || 0,
      pass3_input: whiteCard.tokens?.pass3_input || 0,
      pass3_output: whiteCard.tokens?.pass3_output || 0,
      total_input: (pass1Result.tokens?.pass1_input || 0) + (pass2Result.tokens?.pass2_input || 0) + (whiteCard.tokens?.pass3_input || 0),
      total_output: (pass1Result.tokens?.pass1_output || 0) + (pass2Result.tokens?.pass2_output || 0) + (whiteCard.tokens?.pass3_output || 0)
    };

    logInfo({
      event_type: 'analyze_v2_complete',
      duration_ms: duration,
      outcome: whiteCard.outcome,
      timing: timingData,
      tokens: tokenData
    });

    return {
      // White card (main output)
      outcome: whiteCard.outcome,
      monthly_premium: whiteCard.monthly_premium,
      enrollment_fee: whiteCard.enrollment_fee,
      reason: whiteCard.reason,
      summary: whiteCard.summary,
      customer_name: whiteCard.customer_name,
      policy_details: whiteCard.policy_details,
      red_flags: whiteCard.red_flags,

      // Opening analysis
      opening_quality: whiteCard.opening_quality,
      opening_score: pass2Result.opening_analysis.opening_score,
      opening_analysis: pass2Result.opening_analysis,

      // Compliance analysis
      compliance_status: whiteCard.compliance_status,
      compliance_details: pass2Result.post_close_compliance,

      // Talk metrics
      talk_metrics: talkMetrics,

      // Rebuttal analysis
      rebuttal_analysis: rebuttalAnalysis,

      // Raw data from passes
      pass1_extraction: pass1Result.extracted,
      pass2_analysis: pass2Result,

      // Transcript
      transcript: pass1Result.formattedTranscript,
      segments: pass1Result.segments,
      entities: pass1Result.entities,
      deepgram_summary: pass1Result.deepgram_summary,

      // Performance metrics
      timing: timingData,
      tokens: tokenData,

      // Metadata
      duration_ms: duration,
      analysis_version: 'v2_3pass_sequential'
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logError('analyze_v2_error', error, {
      event_type: 'analyze_v2_error',
      duration_ms: duration
    });
    throw error;
  }
}