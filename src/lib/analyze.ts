// src/lib/analyze.ts
import { AnalysisSchema } from "./analysis-schema";

export async function runAnalysis({
  systemPrompt,
  userPrompt
}: {
  systemPrompt: string;
  userPrompt: string;
}) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5-thinking",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  const data = await r.json();
  const txt = data.choices?.[0]?.message?.content ?? "{}";

  let parsed: unknown;
  try { parsed = JSON.parse(txt); } catch { throw new Error("Model did not return JSON"); }
  return AnalysisSchema.parse(parsed);
}