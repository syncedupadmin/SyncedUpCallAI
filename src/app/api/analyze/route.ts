// src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { transcribeFromUrl } from "@/lib/asr-nova2";
import { computeTalkMetrics, isVoicemailLike } from "@/lib/metrics";
import { ANALYSIS_SYSTEM, userPrompt as userPromptTpl } from "@/prompts"; // your updated file
import { runAnalysis } from "@/lib/analyze";

export async function POST(req: NextRequest) {
  try {
    const { recording_url, meta } = await req.json();

    if (!recording_url) return NextResponse.json({ error: "recording_url required" }, { status: 400 });

    const { segments, asrQuality } = await transcribeFromUrl(recording_url);

    // Fast path: voicemail
    if (isVoicemailLike(segments)) {
      return NextResponse.json({
        version: "2.0",
        model: "gpt-5-thinking",
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
        asr_quality: "good",
        summary: "No answer; voicemail detected.",
        notes: null
      });
    }

    // Build transcript text for the prompt (speaker-tagged)
    const transcript = segments
      .map(s => `${s.speaker.toUpperCase()} [${new Date(s.startMs).toISOString().substring(14,19)}]: ${s.text}`)
      .join("\n");

    const talk = computeTalkMetrics(segments);

    const up = userPromptTpl(
      {
        ...meta,
        tz: meta?.tz ?? process.env.TZ ?? "America/New_York",
      },
      transcript
    );

    const finalJson = await runAnalysis({
      systemPrompt: ANALYSIS_SYSTEM,
      userPrompt: up
    });

    // Overwrite with ground-truth metrics + ASR quality to prevent LLM drift
    finalJson.talk_metrics = talk;
    finalJson.asr_quality = finalJson.asr_quality ?? (segments.length ? "good" : "poor");

    return NextResponse.json(finalJson);
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}