"use client";
import React from "react";

export type Analysis = {
  version: "2.0";
  model: string;
  reason_primary: string;
  reason_secondary: string | null;
  confidence: number;
  qa_score: number;
  script_adherence: number;
  qa_breakdown: {
    greeting: number; discovery: number; benefit_explanation: number;
    objection_handling: number; compliance: number; closing: number;
  };
  sentiment_agent: number;
  sentiment_customer: number;
  talk_metrics: {
    talk_time_agent_sec: number;
    talk_time_customer_sec: number;
    silence_time_sec: number;
    interrupt_count: number;
  };
  lead_score: number;
  purchase_intent: "low" | "medium" | "high";
  risk_flags: string[];
  compliance_flags?: string[];
  actions: string[];
  best_callback_window: { local_start: string; local_end: string } | null;
  crm_updates: {
    disposition: string;
    callback_requested: boolean;
    callback_time_local: string | null;
    dnc: boolean;
  };
  key_quotes: { ts: string; speaker: "agent" | "customer"; quote: string }[];
  asr_quality: "poor" | "fair" | "good" | "excellent";
  summary: string;
  notes: string | null;
};

function toLocal(dt?: string | null) { if (!dt) return ""; const d = new Date(dt); return isNaN(d.valueOf()) ? dt : d.toLocaleString(); }
const minutes = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

const badgeMap: Record<string, string> = {
  slate: "bg-slate-100 text-slate-800",
  blue: "bg-blue-100 text-blue-800",
  amber: "bg-amber-100 text-amber-800",
  rose: "bg-rose-100 text-rose-800",
  violet: "bg-violet-100 text-violet-800",
  emerald: "bg-emerald-100 text-emerald-800",
};
function Badge({ tone = "slate", children }: { tone?: keyof typeof badgeMap; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${badgeMap[tone]}`}>{children}</span>;
}
function Progress({ value }: { value: number }) { const safe = Math.max(0, Math.min(100, value)); return <div className="w-full h-2 rounded bg-slate-200"><div className="h-2 rounded bg-slate-800" style={{ width: `${safe}%` }} /></div>; }
function Meter({ label, value }: { label: string; value: number }) {
  return (<div className="space-y-1"><div className="flex items-center justify-between text-sm"><span className="text-slate-600">{label}</span><span className="font-semibold">{value}</span></div><Progress value={value} /></div>);
}
function Chip({ text }: { text: string }) { return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800">{text}</span>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div className="rounded-2xl border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3><div className="space-y-3">{children}</div></div>);
}

const reasonTone: Record<string, keyof typeof badgeMap> = { pricing:"amber", spouse_approval:"blue", bank_decline:"rose", benefits_confusion:"violet", trust_scam_fear:"rose" };

export default function CallAnalysisCard({ data }: { data: Analysis }) {
  const d = data;
  const tone = reasonTone[d.reason_primary] || "slate";
  return (
    <div className="bg-white p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-start justify-between">
          <div><h1 className="text-xl font-bold text-slate-900">Call Analysis</h1><p className="text-sm text-slate-600">Model {d.model} • v{d.version} • Confidence {Math.round(d.confidence * 100)}%</p></div>
          <div className="flex items-center gap-2"><Badge tone={tone}>{d.reason_primary.replaceAll("_", " ")}</Badge>{d.purchase_intent && <Badge tone="emerald">intent: {d.purchase_intent}</Badge>}<Badge tone="slate">lead score: {d.lead_score}</Badge></div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-slate-900 font-medium">{d.summary}</div>
            <div className="text-sm text-slate-600">Callback window: {d.best_callback_window ? `${toLocal(d.best_callback_window.local_start)} → ${toLocal(d.best_callback_window.local_end)}` : "—"}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-4">
            <Section title="Scores">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3"><Meter label="QA Score" value={d.qa_score} /><Meter label="Script Adherence" value={d.script_adherence} /></div>
                <div className="space-y-3"><div className="text-sm text-slate-600">Sentiment (agent/customer)</div><div className="flex gap-2 text-sm"><Chip text={`agent ${d.sentiment_agent.toFixed(2)}`} /><Chip text={`customer ${d.sentiment_customer.toFixed(2)}`} /><Chip text={`ASR ${d.asr_quality}`} /></div></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                <Meter label="Greeting" value={d.qa_breakdown.greeting} />
                <Meter label="Discovery" value={d.qa_breakdown.discovery} />
                <Meter label="Benefits" value={d.qa_breakdown.benefit_explanation} />
                <Meter label="Objections" value={d.qa_breakdown.objection_handling} />
                <Meter label="Compliance" value={d.qa_breakdown.compliance} />
                <Meter label="Closing" value={d.qa_breakdown.closing} />
              </div>
            </Section>

            <Section title="Key Quotes">
              <ul className="space-y-3">
                {d.key_quotes?.map((q, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500"><span>{q.ts}</span><span>•</span><span className="uppercase">{q.speaker}</span></div>
                    <div className="mt-1 text-slate-900">"{q.quote}"</div>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <div className="space-y-4">
            <Section title="Outcome & Risks">
              <div className="flex flex-wrap gap-2">{d.risk_flags?.length ? d.risk_flags.map((r, i) => <Chip key={i} text={r} />) : <Chip text="no risk flags" />}</div>
              {!!d.compliance_flags?.length && <div className="flex flex-wrap gap-2">{d.compliance_flags.map((r, i) => <Chip key={i} text={`compliance: ${r}`} />)}</div>}
              {d.reason_secondary ? <div className="text-sm text-slate-700">Detail: {d.reason_secondary}</div> : null}
            </Section>

            <Section title="Talk Metrics">
              <div className="grid grid-cols-1 gap-3 text-sm text-slate-700">
                <div>Agent: {minutes(d.talk_metrics.talk_time_agent_sec)}</div>
                <div>Customer: {minutes(d.talk_metrics.talk_time_customer_sec)}</div>
                <div>Silence: {minutes(d.talk_metrics.silence_time_sec)}</div>
                <div>Interrupts: {d.talk_metrics.interrupt_count}</div>
              </div>
            </Section>

            <Section title="Actions">
              <div className="flex flex-wrap gap-2">
                {d.actions.map((a, i) => (
                  <button key={i} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50" onClick={() => alert(`${a} (wire to CRM/GHL)`)}>
                    {a.replaceAll("_", " ")}
                  </button>
                ))}
              </div>
              <div className="text-xs text-slate-500">Wire these to: schedule callback, benefits email, trust email, payment retry, DNC, etc.</div>
            </Section>

            <Section title="CRM Updates">
              <div className="grid grid-cols-1 gap-2 text-sm">
                <div>Disposition: <span className="font-medium">{d.crm_updates.disposition}</span></div>
                <div>Callback requested: <span className="font-medium">{d.crm_updates.callback_requested ? "Yes" : "No"}</span></div>
                <div>Callback time: <span className="font-medium">{toLocal(d.crm_updates.callback_time_local)}</span></div>
                <div>DNC: <span className="font-medium">{d.crm_updates.dnc ? "Yes" : "No"}</span></div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}