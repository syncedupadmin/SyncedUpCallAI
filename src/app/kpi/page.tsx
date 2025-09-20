"use client";
import { useEffect, useState } from "react";

type KPIPayload = {
  totals: { handled:number; contacts:number; sales:number; post_dates:number };
  rates: {
    close_rate:number; post_date_rate:number; enroll_fee_rate:number;
    callback_set_rate:number; opening_rebuttal_usage:number; closing_rebuttal_usage:number;
    hold_time_rate:number; price_change_rate:number;
  };
  averages: {
    avg_ticket:number; avg_applied_discount_cents:number;
    missed_rebuttals_per_call:number; questions_first_minute:number; talk_ratio_agent:number;
  };
};

type Summary = {
  day: string;
  week_start: string;
  baseline: KPIPayload | null;
  daily: KPIPayload | null;
  weekly: KPIPayload | null;
};

function Delta({ now, base, fmt = "pct" }: { now:number; base:number; fmt?:"pct"|"usd"|"raw"|"cents" }) {
  if (base === 0 && now === 0) return <span className="text-slate-500">—</span>;
  const diff = now - base;
  const sign = diff > 0 ? "+" : "";
  const cls = diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-slate-600";
  const render = (v:number) =>
    fmt === "pct" ? `${(v*100).toFixed(1)}%`
    : fmt === "usd" ? `$${v.toFixed(2)}`
    : fmt === "cents" ? `$${(v/100).toFixed(2)}`
    : `${v.toFixed(2)}`;
  return <span className={cls}>{sign}{render(diff)}</span>;
}

export default function KPIPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // TODO: plug actual agencyId from session/tenant
  const agencyId = typeof window !== "undefined" ? localStorage.getItem("agencyId") || "" : "";

  useEffect(() => {
    const id = agencyId || "00000000-0000-0000-0000-000000000000"; // replace for your test
    fetch(`/api/kpi/summary?agencyId=${id}`)
      .then(r => r.json()).then(setData).catch(e => setErr(String(e)));
  }, []);

  if (err) return <div className="p-6 text-rose-600">{err}</div>;
  if (!data) return <div className="p-6">Loading KPIs…</div>;

  const { baseline, daily, weekly, day, week_start } = data;

  const card = (title:string, now:KPIPayload|null, base:KPIPayload|null) => (
    <div className="rounded-2xl border p-4 bg-white shadow-sm">
      <div className="text-lg font-semibold mb-2">{title}</div>
      {!now ? <div className="text-slate-500">No data.</div> :
      !base ? <div className="text-slate-500">No baseline available.</div> :
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-slate-500">Close rate</div>
          <div className="font-medium">{(now.rates.close_rate*100).toFixed(1)}% <Delta now={now.rates.close_rate} base={base.rates.close_rate}/></div>
        </div>
        <div>
          <div className="text-slate-500">Post-date rate</div>
          <div className="font-medium">{(now.rates.post_date_rate*100).toFixed(1)}% <Delta now={now.rates.post_date_rate} base={base.rates.post_date_rate}/></div>
        </div>
        <div>
          <div className="text-slate-500">Avg ticket</div>
          <div className="font-medium">${now.averages.avg_ticket.toFixed(2)} <Delta now={now.averages.avg_ticket} base={base.averages.avg_ticket} fmt="usd"/></div>
        </div>
        <div>
          <div className="text-slate-500">Enroll fee rate</div>
          <div className="font-medium">{(now.rates.enroll_fee_rate*100).toFixed(1)}% <Delta now={now.rates.enroll_fee_rate} base={base.rates.enroll_fee_rate}/></div>
        </div>
        <div>
          <div className="text-slate-500">Opening rebuttal usage</div>
          <div className="font-medium">{(now.rates.opening_rebuttal_usage*100).toFixed(1)}% <Delta now={now.rates.opening_rebuttal_usage} base={base.rates.opening_rebuttal_usage}/></div>
        </div>
        <div>
          <div className="text-slate-500">Closing rebuttal usage</div>
          <div className="font-medium">{(now.rates.closing_rebuttal_usage*100).toFixed(1)}% <Delta now={now.rates.closing_rebuttal_usage} base={base.rates.closing_rebuttal_usage}/></div>
        </div>
        <div>
          <div className="text-slate-500">Missed rebuttals / call</div>
          <div className="font-medium">{now.averages.missed_rebuttals_per_call.toFixed(2)} <Delta now={now.averages.missed_rebuttals_per_call} base={base.averages.missed_rebuttals_per_call} fmt="raw"/></div>
        </div>
        <div>
          <div className="text-slate-500">Price change rate</div>
          <div className="font-medium">{(now.rates.price_change_rate*100).toFixed(1)}% <Delta now={now.rates.price_change_rate} base={base.rates.price_change_rate}/></div>
        </div>
        <div>
          <div className="text-slate-500">Avg discount</div>
          <div className="font-medium">${(now.averages.avg_applied_discount_cents/100).toFixed(2)} <Delta now={now.averages.avg_applied_discount_cents} base={base.averages.avg_applied_discount_cents} fmt="cents"/></div>
        </div>
        <div>
          <div className="text-slate-500">Qs in first min (median)</div>
          <div className="font-medium">{now.averages.questions_first_minute.toFixed(1)} <Delta now={now.averages.questions_first_minute} base={base.averages.questions_first_minute} fmt="raw"/></div>
        </div>
        <div>
          <div className="text-slate-500">Agent talk ratio (median)</div>
          <div className="font-medium">{(now.averages.talk_ratio_agent*100).toFixed(0)}% <Delta now={now.averages.talk_ratio_agent} base={base.averages.talk_ratio_agent}/></div>
        </div>
        <div>
          <div className="text-slate-500">Hold &gt; 60s</div>
          <div className="font-medium">{(now.rates.hold_time_rate*100).toFixed(1)}% <Delta now={now.rates.hold_time_rate} base={base.rates.hold_time_rate}/></div>
        </div>
      </div>}
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="text-2xl font-bold">KPI Dashboard</div>
      <div className="text-sm text-slate-600">
        Baseline is frozen from your first 10k calls. Showing deltas vs baseline.
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        {card(`Yesterday (${day})`, daily, baseline)}
        {card(`This Week (from ${week_start})`, weekly, baseline)}
      </div>
    </div>
  );
}