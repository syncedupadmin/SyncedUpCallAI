// src/lib/analyze.ts
import { AnalysisSchema } from "@/lib/analysis-schema";

const MODEL_CANDIDATES = [
  process.env.OPENAI_MODEL,        // prefer env override
  "gpt-4o-mini",                   // cheap + JSON-friendly
  "gpt-4o"                         // heavier, if you have it
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

  // If model is missing, OpenAI returns 404 with a helpful JSON error.
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    const e = new Error(`OpenAI ${r.status} for model ${model}: ${err}`);
    // Tag status so we can fallback only on model-not-found cases
    // @ts-ignore
    (e as any).status = r.status;
    throw e;
  }
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(txt);
}

export async function runAnalysis({ systemPrompt, userPrompt }: { systemPrompt: string; userPrompt: string; }) {
  let lastError: any = null;
  for (const m of MODEL_CANDIDATES) {
    try {
      const parsed = await callOpenAI(m, systemPrompt, userPrompt);
      return AnalysisSchema.parse(parsed);
    } catch (e: any) {
      lastError = e;
      // Only fallback if it's a 404 (model not found). Otherwise, surface the error.
      if (e?.status !== 404) break;
      continue;
    }
  }
  throw lastError || new Error("No usable OpenAI model found.");
}