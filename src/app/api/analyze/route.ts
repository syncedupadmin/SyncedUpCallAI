// src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { transcribeFromUrl } from "@/lib/asr-nova2";
import { computeTalkMetrics, isVoicemailLike } from "@/lib/metrics";
import { ANALYSIS_SYSTEM, userPrompt as userPromptTpl } from "@/lib/prompts";
import { runAnalysis } from "@/lib/analyze";
import { detectRebuttalsAndEscapes } from "@/lib/rebuttal-detector";
import { openingAndControl } from "@/lib/opening-control";
import { extractPriceEvents } from "@/lib/price-events";
import { choosePremiumAndFee } from "@/lib/money";
import { detectRebuttals } from "@/lib/rebuttal-detect";
import { computeSignals, decideOutcome } from "@/lib/rules-engine";
import { detectRebuttalsV3, type Segment as RSeg } from "@/lib/rebuttal-detect-v3";
import { chooseCustomerName } from "@/lib/name-merge";
import { PLAYBOOK } from "@/domain/playbook";
import type { Segment } from "@/lib/asr-nova2";

// Let this function actually run long enough and never get cached
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro allows 60s. If on Hobby, keep ≤10s.

function withTimeout<T>(p: Promise<T>, ms = 25000) {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout after ${ms}ms`)), ms))
  ]);
}

function detectPayment(segments: Segment[]){
  for (const s of segments){
    if (s.speaker !== "customer") continue;
    const digits = s.text.replace(/\D/g,"");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
      return { payment_taken:true, last4: digits.slice(-4) };
    }
  }
  return { payment_taken:false, last4:null };
}

function luhn(num:string){
  let sum=0, alt=false;
  for(let i=num.length-1;i>=0;i--){
    let n=+num[i];
    if(alt){ n*=2; if(n>9) n-=9; }
    sum+=n; alt=!alt;
  }
  return sum%10===0;
}

const msToMMSS = (ms:number) => {
  const s = Math.round(ms/1000);
  return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
};

export async function POST(req: NextRequest) {
  try {
    const { recording_url, meta } = await req.json();

    if (!recording_url) {
      return NextResponse.json({ error: "recording_url required" }, { status: 400 });
    }

    // Deepgram + metrics (with timeout)
    const { segments, asrQuality } = await withTimeout(transcribeFromUrl(recording_url), 25000);
    if (!segments?.length) {
      return NextResponse.json({ error: "No speech detected" }, { status: 422 });
    }

    if (isVoicemailLike(segments)) {
      return NextResponse.json({
        version: "2.0",
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        reason_primary: "no_answer_voicemail",
        reason_secondary: null,
        confidence: 0.9,
        qa_score: 0,
        script_adherence: 0,
        qa_breakdown: { greeting:0, discovery:0, benefit_explanation:0, objection_handling:0, compliance:0, closing:0 },
        sentiment_agent: 0,
        sentiment_customer: -0.2,
        talk_metrics: { talk_time_agent_sec:0, talk_time_customer_sec:0, silence_time_sec:0, interrupt_count:0 },
        lead_score: 0,
        purchase_intent: "low",
        risk_flags: [],
        compliance_flags: [],
        actions: ["schedule_callback"],
        best_callback_window: null,
        crm_updates: { disposition:"voicemail", callback_requested:false, callback_time_local:null, dnc:false },
        key_quotes: [],
        asr_quality: asrQuality,
        summary: "No answer; voicemail detected.",
        notes: null
      });
    }

    const transcript = segments
      .map(s => `${s.speaker.toUpperCase()} [${new Date(s.startMs).toISOString().substring(14,19)}]: ${s.text}`)
      .join("\n");

    const talk = computeTalkMetrics(segments);

    // Use new rules engine if enabled
    const USE_RULE_ENGINE = process.env.USE_RULE_ENGINE === "true";

    if (USE_RULE_ENGINE) {
      // New deterministic rule engine path
      const signals = computeSignals(segments);

      // Build user prompt with signals
      const up = userPromptTpl({ ...meta, tz: PLAYBOOK.timezone }, transcript, signals);

      let finalJson: any;
      try {
        // LLM with timeout
        finalJson = await withTimeout(runAnalysis({ systemPrompt: ANALYSIS_SYSTEM, userPrompt: up }), 25000);
        finalJson.talk_metrics = talk;
        finalJson.asr_quality = finalJson.asr_quality ?? asrQuality;

        // Apply policy overrides
        const o = decideOutcome(signals);
        finalJson.outcome = { sale_status: o.sale_status, payment_confirmed: o.payment_confirmed, post_date_iso: o.post_date_iso };

        if (!finalJson.facts) {
          finalJson.facts = {} as any;
        }
        const facts = finalJson.facts as any;
        if (!facts.pricing) {
          facts.pricing = {};
        }
        facts.pricing.premium_unit = "monthly";
        if (signals.price_monthly_cents != null) facts.pricing.premium_amount = signals.price_monthly_cents / 100;
        if (signals.enrollment_fee_cents != null) facts.pricing.signup_fee = signals.enrollment_fee_cents / 100;

        finalJson.signals = {
          ...(finalJson.signals ?? {}),
          card_provided: !!signals.card_spoken,
          card_last4: signals.card_last4,
          esign_sent: signals.esign_sent,
          esign_confirmed: signals.esign_confirmed,
          charge_confirmed_phrase: signals.sale_confirm_phrase,
          post_date_phrase: signals.post_date_phrase
        };


        // Use the new V3 rebuttal detection
        const rb3 = detectRebuttalsV3(segments as unknown as RSeg[]);

        // Attach the two sections
        finalJson.rebuttals_opening = rb3.opening;
        finalJson.rebuttals_money = rb3.money;

        // For backward-compat UI, merge the views
        finalJson.rebuttals = {
          used: [...rb3.opening.used, ...rb3.money.used],
          missed: [...rb3.opening.missed, ...rb3.money.missed],
          counts: {
            used: rb3.opening.counts.used + rb3.money.counts.used,
            missed: rb3.opening.counts.missed + rb3.money.counts.missed,
            asked_for_card_after_last_rebuttal: rb3.money.counts.asked_for_card_after_last_rebuttal
          }
        };

        // Name detection using merger logic
        const nameChoice = chooseCustomerName(
          {
            customer_first_name: meta?.customer_first_name,
            customer_last_name: meta?.customer_last_name,
            customer_full_name: meta?.customer_full_name,
            agent_name: meta?.agent_name
          },
          segments.map(s => ({ speaker: s.speaker, text: s.text, startMs: s.startMs }))
        );

        // Surface on the JSON payload for UI
        finalJson.contact_guess = {
          first_name: nameChoice.first_name,
          last_name: nameChoice.last_name,
          confidence: nameChoice.confidence,
          evidence_ts: nameChoice.evidence_ts,
          evidence_quote: nameChoice.evidence_quote,
          source: nameChoice.source,
          alternate: nameChoice.alternate ?? null
        };

        return NextResponse.json(finalJson);
      } catch (e: any) {
        // Log validation errors but don't fail the request
        if (e?.issues) {
          console.error("Validation error in rule engine path:", e.issues);
          console.error("Failed model output:", finalJson);
          // Return partial data with validation flag
          return NextResponse.json({
            ...finalJson,
            validation: "failed",
            validation_issues: e.issues
          }, { status: 200 }); // Return 200 to avoid breaking UI
        }
        throw e;
      }
    }

    // Legacy path - existing rebuttal detection
    const { escapes, rebuttalsUsed, rebuttalsMissed, summary } =
      await detectRebuttalsAndEscapes(segments);

    // Build prelabels to steer the LLM and also to fill fields if you want to bypass it
    const prelabels = {
      escape_attempts: escapes,
      rebuttals_used: rebuttalsUsed,
      rebuttals_missed: rebuttalsMissed,
      rebuttal_summary: summary
    };

    // Extract money from transcript
    const pricing = choosePremiumAndFee(transcript);

    // Detect rebuttals
    const rebuttals = detectRebuttals(segments);

    // Detect payment and prepare signals
    const pay = detectPayment(segments);

    // Check for post-date and charge confirmation phrases
    const transcriptLower = transcript.toLowerCase();
    const hasPostDate = /post\s*date|charge\s+on|process\s+on/.test(transcriptLower);
    const hasChargeConfirmed = /payment\s+(approved|processed|went\s+through)|charged\s+your|successfully\s+charged/.test(transcriptLower);

    const signals = {
      card_provided: pay.payment_taken,
      card_last4: pay.last4,
      esign_sent: /text.*link|sent.*link|e-?sign/.test(transcriptLower),
      esign_confirmed: /signed\s+it|sent\s+it\s+back/.test(transcriptLower),
      charge_confirmed_phrase: hasChargeConfirmed,
      post_date_phrase: hasPostDate
    };

    // Include prelabels, pricing hints, and signals in the user prompt so the model stays consistent
    const up = userPromptTpl(
      {
        ...meta,
        tz: meta?.tz ?? process.env.TZ ?? "America/New_York",
        prelabels,
        price_hint_cents: pricing.premium_cents,
        fee_hint_cents: pricing.fee_cents,
        signals
      },
      transcript
    );

    let finalJson: any;
    try {
      // LLM with timeout
      finalJson = await withTimeout(runAnalysis({ systemPrompt: ANALYSIS_SYSTEM, userPrompt: up }), 25000);
      finalJson.talk_metrics = talk;
      finalJson.asr_quality = finalJson.asr_quality ?? asrQuality;

      // Merge the deterministic results so the UI always shows them even if the model has a mood
      finalJson.escape_attempts = prelabels.escape_attempts;
      finalJson.rebuttals_used = prelabels.rebuttals_used;
      finalJson.rebuttals_missed = prelabels.rebuttals_missed;
      finalJson.rebuttal_summary = prelabels.rebuttal_summary;

      // Coaching flags you asked for
      const flags: ("ignored_stated_objection" | "did_not_use_rebuttals" | "no_opening" | "less_than_two_rebuttals" | "did_not_ask_card_after_rebuttal")[] = [];
      if (!prelabels.rebuttals_used?.length) flags.push("did_not_use_rebuttals");
      if (prelabels.rebuttal_summary.total_used < 2) flags.push("less_than_two_rebuttals");
      if (!prelabels.rebuttal_summary.asked_for_card_after_last_rebuttal) flags.push("did_not_ask_card_after_rebuttal");
      finalJson.coaching_flags = Array.from(new Set([...(finalJson.coaching_flags||[]), ...flags]));

      // Opening and control scores
      const oc = openingAndControl(segments);
      finalJson.opening_score = oc.opening_score;
      finalJson.control_score = oc.control_score;
      finalJson.opening_feedback = oc.opening_feedback;

      // Extract price events
      const { events: priceEvents, facts } = extractPriceEvents(segments);
      finalJson.price_events = priceEvents;
      finalJson.facts = { ...(finalJson.facts||{}), ...facts };

      // Policy overrides: trust deterministic numbers if present
      if (pricing.premium_cents) {
        if (!finalJson.facts) {
          finalJson.facts = {} as any;
        }
        (finalJson.facts as any).pricing = {
          premium_amount: pricing.premium_cents / 100,
          premium_unit: "monthly" as const,
          signup_fee: pricing.fee_cents ? pricing.fee_cents / 100 : null,
          discount_amount: finalJson.facts?.pricing?.discount_amount ?? null
        };
        if (!finalJson.evidence) {
          finalJson.evidence = {} as any;
        }
        (finalJson.evidence as any).premium_quote = pricing.evidence?.premium_quote;
      }

      // Compute outcome deterministically
      const outcome = (() => {
        // precedence: explicit post-date > payment confirmed > nothing
        if (signals.post_date_phrase) {
          return {
            sale_status: "post_date" as const,
            payment_confirmed: false,
            post_date_iso: null,
            evidence_quote: "post date scheduled"
          };
        }
        if (signals.charge_confirmed_phrase) {
          return {
            sale_status: "sale" as const,
            payment_confirmed: true,
            post_date_iso: null,
            evidence_quote: "payment approved/processed"
          };
        }
        return { sale_status: "none" as const, payment_confirmed: false, post_date_iso: null };
      })();

      // CRM disposition mapping
      const crmDisposition =
        outcome.sale_status === "sale" ? "SALE - Sale" :
        outcome.sale_status === "post_date" ? "PD - Post Date!" :
        (finalJson.crm_updates?.disposition ?? meta?.disposition ?? "Unknown");

      // Merge everything
      finalJson.signals = { ...(finalJson.signals ?? {}), ...signals };
      finalJson.outcome = { ...(finalJson.outcome ?? {}), ...outcome };
      finalJson.rebuttals = finalJson.rebuttals ?? rebuttals;
      finalJson.crm_updates = {
        ...(finalJson.crm_updates ?? {}),
        disposition: crmDisposition
      };

      return NextResponse.json(finalJson);
    } catch (e: any) {
      // Log validation errors but don't fail the request
      if (e?.issues) {
        console.error("Validation error in legacy path:", e.issues);
        console.error("Failed model output:", finalJson);
        // Return partial data with validation flag
        return NextResponse.json({
          ...finalJson,
          validation: "failed",
          validation_issues: e.issues
        }, { status: 200 }); // Return 200 to avoid breaking UI
      }
      throw e; // will be caught by the outer catch and become 500
    }
  } catch (e: any) {
    // Always return JSON, never plain text
    const msg = String(e?.message || e || "Unknown error");
    const status = /Timeout/i.test(msg) ? 504 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}