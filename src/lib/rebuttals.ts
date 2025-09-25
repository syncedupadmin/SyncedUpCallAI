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

const red7 = (s:string) => s.replace(/\d{7,}/g, "#######");
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
      quote_customer: red7(obj.quote).slice(0, 200),
      agent_snippet: red7(agent_snippet)
    });
  }
  return items;
}

export async function classifyRebuttals(items: Array<{ ts:string; stall_type: ObjectionSpan["stall_type"]; quote_customer:string; agent_snippet:string }>): Promise<Rebuttals> {
  const sys = await readFileText("/prompts/passB_rebuttals.md");
  const schema = await readJSON("/prompts/rebuttals.schema.json");

  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `ITEMS:\n${JSON.stringify(items, null, 2)}` }
    ],
    response_format: { type: "json_schema", json_schema: { name: "Rebuttals", schema, strict: true } },
    max_tokens: 600,
    temperature: 0.1
  });

  const parsed = JSON.parse(resp.choices[0].message.content || "{}");
  // Enforce caps defensively
  parsed.used = Array.isArray(parsed.used) ? parsed.used.slice(0,6) : [];
  parsed.missed = Array.isArray(parsed.missed) ? parsed.missed.slice(0,6) : [];
  return parsed;
}

async function readFileText(relPath: string) {
  const fs = await import("fs/promises");
  const path = await import("path");
  const full = path.join(process.cwd(), relPath.replace(/^\//, ""));
  return fs.readFile(full, "utf8");
}
async function readJSON(relPath: string) {
  const txt = await readFileText(relPath);
  return JSON.parse(txt);
}