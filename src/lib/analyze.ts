// src/lib/analyze.ts
import { AnalysisSchema } from "@/lib/analysis-schema";

const MODEL_CANDIDATES = [
  process.env.OPENAI_MODEL,
  "gpt-4o-mini",
  "gpt-4o"
].filter(Boolean) as string[];

async function callOpenAI(model: string, systemPrompt: string, userPrompt: string) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    const err: any = new Error(`OpenAI ${r.status} (${model}): ${text}`);
    err.status = r.status;
    throw err;
  }
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(txt);
}

function firstStr(x: any): any {
  return Array.isArray(x) ? String(x[0] ?? "") : x;
}

function normalize(o: any) {
  if (!o || typeof o !== "object") return o;

  // enums: single string
  o.reason_primary   = firstStr(o.reason_primary);
  o.purchase_intent  = firstStr(o.purchase_intent);
  if (Array.isArray(o.key_quotes)) {
    o.key_quotes = o.key_quotes.slice(0, 4).map((q: any) => ({
      ts: String(q?.ts ?? ""),
      speaker: firstStr(q?.speaker),
      quote: String(q?.quote ?? "")
    }));
  }

  // integers: round
  const roundInt = (n: any) => Math.max(0, Math.min(100, Math.round(Number(n ?? 0))));
  o.qa_score = roundInt(o.qa_score);
  o.script_adherence = roundInt(o.script_adherence);
  if (o.qa_breakdown) {
    o.qa_breakdown.greeting = roundInt(o.qa_breakdown.greeting);
    o.qa_breakdown.discovery = roundInt(o.qa_breakdown.discovery);
    o.qa_breakdown.benefit_explanation = roundInt(o.qa_breakdown.benefit_explanation);
    o.qa_breakdown.objection_handling = roundInt(o.qa_breakdown.objection_handling);
    o.qa_breakdown.compliance = roundInt(o.qa_breakdown.compliance);
    o.qa_breakdown.closing = roundInt(o.qa_breakdown.closing);
  }

  return o;
}

export async function runAnalysis({ systemPrompt, userPrompt }: { systemPrompt: string; userPrompt: string; }) {
  let lastError: any = null;
  for (const m of MODEL_CANDIDATES) {
    try {
      const raw = await callOpenAI(m, systemPrompt, userPrompt);
      const fixed = normalize(raw);
      return AnalysisSchema.parse(fixed);
    } catch (e: any) {
      lastError = e;
      if (e?.status !== 404) break; // only fall back on model-not-found
    }
  }
  throw lastError || new Error("No usable OpenAI model found.");
}