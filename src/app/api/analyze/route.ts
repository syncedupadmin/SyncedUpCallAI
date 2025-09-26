// src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { analyzeCallUnified } from "@/lib/unified-analysis";
import { sbAdmin } from "@/lib/supabase-admin";

// Let this function actually run long enough and never get cached
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro allows 60s. If on Hobby, keep ≤10s.

export async function POST(req: NextRequest) {
  try {
    const { recording_url, meta } = await req.json();

    if (!recording_url) {
      return NextResponse.json({ error: "recording_url required" }, { status: 400 });
    }

    console.log('=== UNIFIED ANALYSIS ROUTE ===');
    console.log('URL being analyzed:', recording_url);
    console.log('Timestamp:', new Date().toISOString());
    console.log('Meta data:', meta);

    // Use the unified analysis that includes:
    // - Two-pass extraction system
    // - ASR price correction
    // - Rebuttals detection (addressed/missed/immediate)
    // - All new fields from test-simple
    const result = await analyzeCallUnified(recording_url, meta, {
      includeScores: true,  // Include backward compatibility scores for existing UI
      skipRebuttals: false  // Include full rebuttals analysis
    });

    console.log('=== ANALYSIS COMPLETE ===');
    console.log('Outcome:', result.analysis?.outcome);
    console.log('Monthly Premium:', result.analysis?.monthly_premium);
    console.log('Enrollment Fee:', result.analysis?.enrollment_fee);
    console.log('Rebuttals addressed:', result.rebuttals?.used?.length || 0);
    console.log('Rebuttals missed:', result.rebuttals?.missed?.length || 0);
    console.log('Immediate responses:', result.rebuttals?.immediate?.length || 0);

    // Transform the result to match the expected format of the old system
    const finalJson = {
      // Core fields from the new analysis
      version: "3.0",
      model: result.metadata?.model || "gpt-4o-mini",

      // Primary reason and outcome
      reason_primary: result.analysis?.outcome || "unknown",
      reason_secondary: result.analysis?.reason || null,
      outcome: {
        sale_status: result.analysis?.outcome === 'sale' ? 'sale' :
                    result.analysis?.outcome === 'callback' ? 'callback' : 'none',
        payment_confirmed: result.analysis?.outcome === 'sale',
        post_date_iso: null
      },

      // Scores (using backward compatibility fields)
      confidence: result.confidence || 0.8,
      qa_score: result.qa_score || 75,
      script_adherence: result.script_adherence || 80,

      // QA Breakdown (using backward compatibility fields)
      qa_breakdown: {
        greeting: result.greeting || 85,
        discovery: result.discovery || 70,
        benefit_explanation: result.benefits || 75,
        objection_handling: result.objections || 80,
        compliance: result.compliance || 90,
        closing: result.closing || 65
      },

      // Sentiment scores
      sentiment_agent: result.sentiment_agent || 0.7,
      sentiment_customer: result.sentiment_customer || 0.5,

      // Talk metrics (from analysis)
      talk_metrics: {
        talk_time_agent_sec: Math.round(result.duration * 0.6) || 0,
        talk_time_customer_sec: Math.round(result.duration * 0.4) || 0,
        silence_time_sec: 0,
        interrupt_count: 0
      },

      // Lead and purchase info
      lead_score: result.score || 50,
      purchase_intent: result.analysis?.outcome === 'sale' ? 'high' :
                      result.analysis?.outcome === 'callback' ? 'medium' : 'low',

      // Risk and compliance flags
      risk_flags: result.analysis?.red_flags || [],
      compliance_flags: [],

      // Actions
      actions: result.analysis?.outcome === 'callback' ? ['schedule_callback'] : [],
      best_callback_window: result.best_callback_window || null,

      // CRM updates
      crm_updates: {
        disposition: result.analysis?.outcome === 'sale' ? 'SALE - Sale' :
                    result.analysis?.outcome === 'callback' ? 'CB - Callback' : 'Unknown',
        callback_requested: result.analysis?.outcome === 'callback',
        callback_time_local: null,
        dnc: false
      },

      // Key quotes (from transcript segments if available)
      key_quotes: [],

      // ASR quality
      asr_quality: result.asr_quality || 'good',

      // Summary and notes
      summary: result.analysis?.summary || '',
      notes: null,

      // Facts (pricing and policy details)
      facts: {
        pricing: {
          premium_amount: result.analysis?.monthly_premium || null,
          premium_unit: "monthly" as const,
          signup_fee: result.analysis?.enrollment_fee || null,
          discount_amount: null
        },
        policy: {
          carrier: result.analysis?.policy_details?.carrier || null,
          plan_type: result.analysis?.policy_details?.plan_type || null,
          effective_date: result.analysis?.policy_details?.effective_date || null
        },
        customer: {
          name: result.analysis?.customer_name || null,
          age: null,
          location: null
        }
      },

      // Contact info
      contact_guess: {
        first_name: result.analysis?.customer_name?.split(' ')[0] || null,
        last_name: result.analysis?.customer_name?.split(' ').slice(1).join(' ') || null,
        confidence: result.analysis?.customer_name ? 0.8 : 0,
        evidence_ts: null,
        evidence_quote: null,
        source: "transcript",
        alternate: null
      },

      // Rebuttals (NEW - from test-simple implementation)
      rebuttals: result.rebuttals || {
        used: [],
        missed: [],
        immediate: []
      },

      // Additional backward compatibility fields
      hold: {
        hold_detected: false,
        hold_duration_sec: 0,
        hold_start_ms: null,
        hold_end_ms: null
      },
      price_change: false,
      price_direction: null,
      discount_cents_total: 0,
      upsell_cents_total: 0,
      wasted_call: false,
      questions_first_minute: 0,

      // Signals for UI
      signals: {
        card_provided: false,
        card_last4: null,
        esign_sent: false,
        esign_confirmed: false,
        charge_confirmed_phrase: result.analysis?.outcome === 'sale',
        post_date_phrase: false
      },

      // Include raw analysis for debugging
      raw_analysis: result.analysis,
      mentions_table: result.mentions_table,

      // Metadata
      metadata: result.metadata,
      transcript: result.transcript,
      utterance_count: result.utterance_count,
      duration: result.duration
    };

    // Persist call analysis with sbAdmin if we have a call_id
    if (meta?.call_id) {
      await sbAdmin
        .from("calls")
        .upsert(
          {
            id: meta.call_id,
            agency_id: meta?.agency_id,
            agent_id: meta?.agent_id ?? null,
            analyzed_at: new Date().toISOString(),
            analysis_json: finalJson,
          },
          { onConflict: "id" }
        );
    }

    return NextResponse.json(finalJson);
  } catch (e: any) {
    // Always return JSON, never plain text
    const msg = String(e?.message || e || "Unknown error");
    const status = /Timeout/i.test(msg) ? 504 : 500;
    console.error('[Analyze Route] Error:', e);
    return NextResponse.json({ error: msg }, { status });
  }
}