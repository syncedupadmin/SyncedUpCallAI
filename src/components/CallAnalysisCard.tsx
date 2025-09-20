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
  evidence?: {
    reason_primary_span: [number, number] | null;
    reason_primary_quote?: string;
  };
  rebuttals_used?: { id: string; bucket: string; ts: string; quote_agent: string; score?: number }[];
  rebuttals_missed?: { escape_type: string; ts: string }[];
  rebuttal_summary?: {
    total_used: number;
    total_missed: number;
    used_ids: string[];
    missed_reasons: string[];
    asked_for_card_after_last_rebuttal?: boolean;
  };
  outcome?: {
    sale_status: "none" | "sale" | "post_date";
    payment_confirmed: boolean;
    post_date_iso: string | null;
    evidence_quote?: string;
  };
  signals?: {
    card_provided: boolean;
    card_last4: string | null;
    esign_sent: boolean;
    esign_confirmed: boolean;
    charge_confirmed_phrase: boolean;
    post_date_phrase: boolean;
  };
  facts?: {
    pricing?: {
      premium_amount: number | null;
      premium_unit: "monthly";
      signup_fee: number | null;
      discount_amount?: number | null;
    };
    plan?: {
      plan_name: string | null;
    };
  };
  rebuttals?: {
    used: Array<{type: string; ts: string; quote: string}>;
    missed: Array<{type: string; at_ts: string; stall_quote: string}>;
    counts: {
      used: number;
      missed: number;
      asked_for_card_after_last_rebuttal: boolean;
    };
  };
  rebuttals_opening?: {
    used: Array<{type: string; ts: string; quote: string}>;
    missed: Array<{type: string; at_ts: string; stall_quote: string}>;
    counts: {
      used: number;
      missed: number;
    };
  };
};

// Safe string helper to prevent crashes
const safe = (s?: string | null) => s ?? "";

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
  return (<div className="space-y-1"><div className="flex items-center justify-between text-sm"><span className="text-gray-700">{label}</span><span className="font-semibold text-black">{value}</span></div><Progress value={value} /></div>);
}
function Chip({ text }: { text: string }) { return <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-1 text-xs font-medium text-black">{text}</span>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div className="rounded-2xl border border-gray-300 bg-gray-50 p-4"><h3 className="text-sm font-semibold text-black mb-3">{title}</h3><div className="space-y-3">{children}</div></div>);
}

const reasonTone: Record<string, keyof typeof badgeMap> = { pricing:"amber", spouse_approval:"blue", bank_decline:"rose", benefits_confusion:"violet", trust_scam_fear:"rose" };

export default function CallAnalysisCard({
  data,
  showActions = false,
  showCustomerQuotes = false,
  showRebuttalScores = true,
  compactUI = false,
}: {
  data: Analysis;
  showActions?: boolean;
  showCustomerQuotes?: boolean;
  showRebuttalScores?: boolean;
  compactUI?: boolean;
}) {
  const d = data;
  const tone = reasonTone[d.reason_primary] || "slate";
  return (
    <div className="bg-white text-black p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-start justify-between">
          <div><h1 className="text-xl font-bold text-black">Call Analysis</h1><p className="text-sm text-gray-700">Model {d.model} • v{d.version} • Confidence {Math.round(d.confidence * 100)}%</p></div>
          <div className="flex items-center gap-2">
            <Badge tone={tone}>{safe(d.reason_primary).replaceAll?.("_", " ")}</Badge>
            {d.outcome?.sale_status === "sale" && <Badge tone="emerald">SALE</Badge>}
            {d.outcome?.sale_status === "post_date" && (
              <Badge tone="amber">POST DATE{d.outcome?.post_date_iso ? `: ${new Date(d.outcome.post_date_iso).toLocaleDateString()}` : ""}</Badge>
            )}
            {d.outcome?.sale_status === "none" && <Badge tone="slate">NO SALE</Badge>}
            {d.purchase_intent && <Badge tone="emerald">intent: {d.purchase_intent}</Badge>}
            <Badge tone="slate">lead score: {d.lead_score}</Badge>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-300 bg-gray-50 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-black font-medium">{safe(d.summary)}</div>
            <div className="text-sm text-gray-700">Callback window: {d.best_callback_window ? `${toLocal(d.best_callback_window.local_start)} → ${toLocal(d.best_callback_window.local_end)}` : "—"}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-4">
            <Section title="Scores">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3"><Meter label="QA Score" value={d.qa_score} /><Meter label="Script Adherence" value={d.script_adherence} /></div>
                <div className="space-y-3"><div className="text-sm text-gray-700">Sentiment (agent/customer)</div><div className="flex gap-2 text-sm"><Chip text={`agent ${d.sentiment_agent.toFixed(2)}`} /><Chip text={`customer ${d.sentiment_customer.toFixed(2)}`} /><Chip text={`ASR ${d.asr_quality}`} /></div></div>
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

            <Section title="Opening Rebuttals (First 30s)">
              {/* Opening rebuttals */}
              {d.rebuttals_opening?.used?.length ? (
                <>
                  <div className="text-xs font-semibold text-black mb-2">Handled ({d.rebuttals_opening.used.length})</div>
                  <ul className="space-y-2">
                    {d.rebuttals_opening.used.map((r, i) => (
                      <li key={i} className="rounded-lg border border-emerald-200 p-2">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <span>{r.ts}</span>
                          <span>•</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-[2px] text-[10px] font-medium text-emerald-800">
                            {r.type}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-black">"{safe(r.quote).substring(0, 100)}..."</div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {d.rebuttals_opening?.missed?.length ? (
                <>
                  <div className="text-xs font-semibold text-black mt-3 mb-2">Missed ({d.rebuttals_opening.missed.length})</div>
                  <ul className="space-y-2">
                    {d.rebuttals_opening.missed.map((m, i) => (
                      <li key={i} className="rounded-lg border border-amber-200 p-2">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <span>{(m as any).at_ts || (m as any).ts}</span>
                          <span>•</span>
                          <span className="rounded-full bg-amber-100 px-2 py-[2px] text-[10px] font-medium text-amber-800">
                            {m.type}
                          </span>
                        </div>
                        {m.stall_quote && <div className="mt-1 text-sm text-black">"{safe(m.stall_quote).substring(0, 100)}..."</div>}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {!d.rebuttals_opening?.used?.length && !d.rebuttals_opening?.missed?.length && (
                <div className="text-sm text-gray-600">No opening objections detected.</div>
              )}
            </Section>

            <Section title="Rebuttals">
              {/* New rebuttals format */}
              {d.rebuttals?.used?.length ? (
                <>
                  <div className="text-xs font-semibold text-black mb-2">Used ({d.rebuttals.used.length})</div>
                  <ul className="space-y-2">
                    {d.rebuttals.used.map((r, i) => (
                      <li key={i} className="rounded-lg border border-slate-200 p-2">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <span>{r.ts}</span>
                          <span>•</span>
                          <span className="rounded-full bg-green-100 px-2 py-[2px] text-[10px] font-medium text-green-800">
                            {r.type}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-black">"{safe(r.quote).substring(0, 100)}..."</div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {d.rebuttals?.missed?.length ? (
                <>
                  <div className="text-xs font-semibold text-black mt-3 mb-2">Missed ({d.rebuttals.missed.length})</div>
                  <ul className="space-y-2">
                    {d.rebuttals.missed.map((m, i) => (
                      <li key={i} className="rounded-lg border border-rose-200 p-2">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <span>{(m as any).at_ts || (m as any).ts}</span>
                          <span>•</span>
                          <span className="rounded-full bg-rose-100 px-2 py-[2px] text-[10px] font-medium text-rose-800">
                            {m.type}
                          </span>
                        </div>
                        {m.stall_quote && <div className="mt-1 text-sm text-black">"{safe(m.stall_quote).substring(0, 100)}..."</div>}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {/* Legacy format fallback */}
              {!d.rebuttals && d.rebuttals_used?.length ? (
                <ul className="space-y-3">
                  {d.rebuttals_used.map((r, i) => (
                    <li key={i} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span>{r.ts}</span>
                        <span>•</span>
                        <span className="uppercase">AGENT</span>
                        <span>•</span>
                        <span className="rounded-full bg-slate-100 px-2 py-[2px] text-[10px] font-medium text-slate-800">
                          {r.bucket}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-[2px] text-[10px] font-medium text-slate-800">
                          {r.id}
                        </span>
                        {showRebuttalScores && typeof r.score === "number" && (
                          <>
                            <span>•</span>
                            <span>match {Math.round(r.score * 100)}%</span>
                          </>
                        )}
                      </div>
                      <div className="mt-1 text-black">"{r.quote_agent}"</div>
                    </li>
                  ))}
                </ul>
              ) : null}

              {!d.rebuttals && !d.rebuttals_used?.length && (
                <div className="text-sm text-gray-600">No rebuttals detected.</div>
              )}

              {d.rebuttals?.counts && (
                <div className="mt-3 text-xs text-gray-700">
                  Asked for card after last rebuttal: {d.rebuttals.counts.asked_for_card_after_last_rebuttal ? "Yes" : "No"}
                </div>
              )}
            </Section>
          </div>

          <div className="space-y-4">
            <Section title="Outcome & Pricing">
              <div className="text-sm text-black">
                {d.outcome?.sale_status === "sale" && <>Payment confirmed{d.signals?.card_last4 ? ` • card **** ${d.signals.card_last4}` : ""}</>}
                {d.outcome?.sale_status === "post_date" && <>Payment scheduled{d.outcome?.post_date_iso ? ` for ${toLocal(d.outcome.post_date_iso)}` : ""}</>}
                {!d.outcome?.sale_status || d.outcome.sale_status === "none" ? "No outcome detected" : null}
              </div>
              {(d.facts?.pricing?.premium_amount || d.facts?.pricing?.signup_fee) && (
                <div className="text-sm text-black mt-2">
                  {d.facts.pricing?.premium_amount && <span>${d.facts.pricing.premium_amount.toFixed(2)}/mo</span>}
                  {d.facts.pricing?.premium_amount && d.facts.pricing?.signup_fee && <span> + </span>}
                  {d.facts.pricing?.signup_fee && <span>${d.facts.pricing.signup_fee.toFixed(2)} enrollment fee</span>}
                </div>
              )}
              {d.outcome?.evidence_quote && <div className="text-xs text-gray-600 mt-1">Evidence: "{safe(d.outcome.evidence_quote)}"</div>}
              <div className="flex flex-wrap gap-2 mt-2">{d.risk_flags?.length ? d.risk_flags.map((r, i) => <Chip key={i} text={r} />) : <Chip text="no risk flags" />}</div>
              {!!d.compliance_flags?.length && <div className="flex flex-wrap gap-2">{d.compliance_flags.map((r, i) => <Chip key={i} text={`compliance: ${r}`} />)}</div>}
              {d.reason_secondary ? <div className="text-sm text-black">Detail: {safe(d.reason_secondary)}</div> : null}
              {d.evidence?.reason_primary_quote && (
                <div className="text-xs text-gray-600">
                  Evidence: "{safe(d.evidence.reason_primary_quote)}"
                </div>
              )}
            </Section>

            <Section title="Talk Metrics">
              <div className="grid grid-cols-1 gap-3 text-sm text-black">
                <div>Agent: {minutes(d.talk_metrics.talk_time_agent_sec)}</div>
                <div>Customer: {minutes(d.talk_metrics.talk_time_customer_sec)}</div>
                <div>Silence: {minutes(d.talk_metrics.silence_time_sec)}</div>
                <div>Interrupts: {d.talk_metrics.interrupt_count}</div>
              </div>
            </Section>

            <Section title="Actions">
              <div className="flex flex-wrap gap-2">
                {d.actions.map((a, i) => (
                  <button key={i} className="rounded-xl border border-gray-400 bg-white px-3 py-2 text-sm font-medium text-black hover:bg-gray-100" onClick={() => alert(`${a} (wire to CRM/GHL)`)}>
                    {safe(a).replaceAll?.("_", " ")}
                  </button>
                ))}
              </div>
              <div className="text-xs text-gray-600">Wire these to: schedule callback, benefits email, trust email, payment retry, DNC, etc.</div>
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