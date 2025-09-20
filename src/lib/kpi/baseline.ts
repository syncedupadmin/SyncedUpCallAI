import { createClient } from "@supabase/supabase-js";

type KPI = {
  handled: number;
  sales: number;
  post_dates: number;
  wasted: number;
  enrollment_fee_sales: number;
  monthly_premium_cents_sum: number;
  monthly_premium_cents_count: number;
  inbound_sales: number;
  outbound_sales: number;
  inbound_handled: number;
  outbound_handled: number;
  callbacks_set: number;

  opening_reb_used: number;
  opening_reb_stalls: number;
  closing_reb_used: number;
  closing_reb_stalls: number;
  missed_reb_total: number;

  price_changed: number;
  discount_cents_sum: number;
  discount_cases: number;

  q_first_minute_samples: number[];
  talk_ratio_agent_samples: number[];

  holds_over_60s: number;
};

function median(xs: number[]) {
  if (!xs.length) return 0;
  const a = [...xs].sort((a,b)=>a-b);
  const m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
}

export async function computeAgencyKPIFromCalls(rows: any[]): Promise<Record<string, number>> {
  const k: KPI = {
    handled: 0, sales: 0, post_dates: 0, wasted: 0, enrollment_fee_sales: 0,
    monthly_premium_cents_sum: 0, monthly_premium_cents_count: 0,
    inbound_sales: 0, outbound_sales: 0, inbound_handled: 0, outbound_handled: 0, callbacks_set: 0,
    opening_reb_used: 0, opening_reb_stalls: 0, closing_reb_used: 0, closing_reb_stalls: 0, missed_reb_total: 0,
    price_changed: 0, discount_cents_sum: 0, discount_cases: 0,
    q_first_minute_samples: [], talk_ratio_agent_samples: [],
    holds_over_60s: 0
  };

  for (const r of rows) {
    k.handled++;

    const outcome = r?.outcome?.sale_status;           // "sale" | "post_date" | "none"
    const callType = r?.signals?.call_type || r.call_type || "unknown"; // "inbound" | "outbound" | "transfer"
    if (outcome === "sale") k.sales++;
    if (outcome === "post_date") k.post_dates++;

    if (r.wasted_call) k.wasted++;
    if (r.facts?.pricing?.signup_fee) k.enrollment_fee_sales++;

    if (r.facts?.pricing?.premium_amount != null) {
      k.monthly_premium_cents_sum += Math.round(Number(r.facts.pricing.premium_amount) * 100);
      k.monthly_premium_cents_count++;
    }

    if (callType === "inbound") k.inbound_handled++;
    if (callType === "outbound") k.outbound_handled++;
    if (callType === "inbound" && outcome === "sale") k.inbound_sales++;
    if (callType === "outbound" && outcome === "sale") k.outbound_sales++;

    if (r.signals?.callback_set || r.callback_set) k.callbacks_set++;

    // rebuttals - check multiple possible structures
    const openingReb = r.rebuttals_opening || r.opening_rebuttals;
    const closingReb = r.rebuttals_closing || r.rebuttals_money || r.rebuttals;

    // Opening rebuttals
    if (openingReb) {
      const opUsed = openingReb.used?.length || openingReb.handled?.length || 0;
      const opMissed = openingReb.missed?.length || 0;
      const opStalls = opUsed + opMissed;
      k.opening_reb_stalls += opStalls;
      k.opening_reb_used += opUsed;
      k.missed_reb_total += opMissed;
    }

    // Closing rebuttals
    if (closingReb) {
      const clUsed = closingReb.used?.length || closingReb.handled?.length || 0;
      const clMissed = closingReb.missed?.length || 0;
      const clStalls = clUsed + clMissed;
      k.closing_reb_stalls += clStalls;
      k.closing_reb_used += clUsed;
      k.missed_reb_total += clMissed;
    }

    // price dynamics
    if (r.price_change) k.price_changed++;
    if (typeof r.discount_cents_total === "number" && r.discount_cents_total > 0) {
      k.discount_cents_sum += r.discount_cents_total;
      k.discount_cases++;
    }

    if (typeof r.questions_first_minute === "number") {
      k.q_first_minute_samples.push(r.questions_first_minute);
    }

    // Check both possible locations for talk ratio
    const talkRatio = r.talk_metrics?.talk_ratio_agent || r.talk_metrics?.ratio_agent || r.talk_ratio_agent;
    if (typeof talkRatio === "number") {
      k.talk_ratio_agent_samples.push(talkRatio);
    }

    // Check hold time from multiple possible structures
    const holdTimeSec = r.hold?.hold_time_sec || r.hold?.total_sec || 0;
    if (holdTimeSec >= 60) k.holds_over_60s++;
  }

  const close_rate = k.handled ? k.sales / k.handled : 0;
  const post_date_rate = k.handled ? k.post_dates / k.handled : 0;
  const wasted_rate = k.handled ? k.wasted / k.handled : 0;
  const avg_ticket = k.monthly_premium_cents_count ? k.monthly_premium_cents_sum / (100 * k.monthly_premium_cents_count) : 0;
  const enroll_fee_rate = k.sales ? k.enrollment_fee_sales / k.sales : 0;

  const close_rate_inbound = k.inbound_handled ? k.inbound_sales / k.inbound_handled : 0;
  const close_rate_outbound = k.outbound_handled ? k.outbound_sales / k.outbound_handled : 0;

  const callback_set_rate = k.handled ? k.callbacks_set / k.handled : 0;

  // One-call-close: sales without callback
  const sales_without_callback = k.sales - k.callbacks_set;
  const one_call_close_rate = k.handled ? Math.max(0, sales_without_callback) / k.handled : 0;

  const opening_rebuttal_usage = k.opening_reb_stalls ? k.opening_reb_used / k.opening_reb_stalls : 0;
  const closing_rebuttal_usage = k.closing_reb_stalls ? k.closing_reb_used / k.closing_reb_stalls : 0;
  const missed_rebuttals_per_call = k.handled ? k.missed_reb_total / k.handled : 0;

  const price_change_rate = k.handled ? k.price_changed / k.handled : 0;
  const avg_applied_discount_cents = k.discount_cases ? Math.round(k.discount_cents_sum / k.discount_cases) : 0;

  const questions_first_minute_med = median(k.q_first_minute_samples);
  const talk_ratio_agent_med = median(k.talk_ratio_agent_samples);

  const hold_time_rate = k.handled ? k.holds_over_60s / k.handled : 0;

  return {
    n: k.handled,
    close_rate,
    post_date_rate,
    wasted_rate,
    avg_ticket,
    enroll_fee_rate,
    close_rate_inbound,
    close_rate_outbound,
    callback_set_rate,
    one_call_close_rate,
    opening_rebuttal_usage,
    closing_rebuttal_usage,
    missed_rebuttals_per_call,
    price_change_rate,
    avg_applied_discount_cents,
    questions_first_minute_med,
    talk_ratio_agent_med,
    hold_time_rate
  };
}