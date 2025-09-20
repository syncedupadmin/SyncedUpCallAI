type Num = number | null | undefined;
type Bool = boolean | null | undefined;
type J = Record<string, any>;

const sum = (a: number, b: number) => a + b;
const safe = (n: Num) => typeof n === "number" && Number.isFinite(n) ? n : 0;
const isTrue = (b: Bool) => b === true;
const pct = (num: number, den: number) => den > 0 ? num / den : 0;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export type KPISnapshot = {
  handled: number;
  sales: number;
  post_dates: number;
  contacts: number;
  wasted_calls: number;

  // money
  premium_cents_sum: number;     // for avg_ticket
  premium_cents_count: number;
  enroll_fee_sales: number;      // sales where a signup_fee>0
  discounted_cases: number;
  discount_cents_sum: number;

  // rebuttals
  open_reb_used: number;
  open_reb_seen: number;
  close_reb_used: number;
  close_reb_seen: number;
  missed_reb_total: number;

  // discovery & talk
  q_first_minute: number[];    // collect per-call; median later
  talk_ratio_agent: number[];  // collect per-call; median later

  // hold & price change
  holds_over60: number;
  price_changed_calls: number;

  // direction
  closes_inbound: number;
  closes_outbound: number;

  // callbacks
  callbacks_set: number;
};

export function makeEmpty(): KPISnapshot {
  return {
    handled: 0, sales: 0, post_dates: 0, contacts: 0, wasted_calls: 0,
    premium_cents_sum: 0, premium_cents_count: 0, enroll_fee_sales: 0,
    discounted_cases: 0, discount_cents_sum: 0,
    open_reb_used: 0, open_reb_seen: 0, close_reb_used: 0, close_reb_seen: 0,
    missed_reb_total: 0,
    q_first_minute: [], talk_ratio_agent: [],
    holds_over60: 0, price_changed_calls: 0,
    closes_inbound: 0, closes_outbound: 0,
    callbacks_set: 0,
  };
}

/** Feed one call's analysis_json into the reducer. */
export function addCall(k: KPISnapshot, a: J) {
  k.handled += 1;
  k.contacts += 1; // if you treat every handled as a contact; adjust if you track "no-answer"

  // outcome / direction
  const outcome = a?.outcome?.sale_status as "sale" | "post_date" | "none" | undefined;
  if (outcome === "sale") k.sales += 1;
  if (outcome === "post_date") k.post_dates += 1;

  const dir = (a?.signals?.call_type ?? a?.call_type) as "inbound" | "outbound" | "transfer" | undefined;
  if (outcome === "sale") {
    if (dir === "inbound" || dir === "transfer") k.closes_inbound += 1;
    else k.closes_outbound += 1;
  }

  // pricing
  const premium = a?.facts?.pricing?.premium_amount;
  const fee = a?.facts?.pricing?.signup_fee;
  const discount = a?.facts?.pricing?.discount_amount;

  if (typeof premium === "number") {
    k.premium_cents_sum += Math.round(premium * 100);
    k.premium_cents_count += 1;
  }
  if (typeof fee === "number" && (outcome === "sale" || outcome === "post_date")) {
    if (fee > 0) k.enroll_fee_sales += 1;
  }
  if (typeof discount === "number" && discount > 0) {
    k.discounted_cases += 1;
    k.discount_cents_sum += Math.round(discount * 100);
  }

  // Alternative discount tracking from discount_cents_total
  const discountCentsTotal = safe(a?.discount_cents_total);
  if (discountCentsTotal > 0 && !discount) {
    k.discounted_cases += 1;
    k.discount_cents_sum += discountCentsTotal;
  }

  // rebuttals (we separated opening vs closing in your pipeline)
  const rbOpen = a?.rebuttals_opening ?? a?.opening_rebuttals;
  if (rbOpen) {
    const used = safe(rbOpen?.counts?.used) || safe(rbOpen?.used?.length);
    const missed = safe(rbOpen?.counts?.missed) || safe(rbOpen?.missed?.length);
    k.open_reb_used += used;
    k.open_reb_seen += used + missed;
    k.missed_reb_total += missed;
  }

  const rbClose = a?.rebuttals_closing ?? a?.rebuttals_money ?? a?.rebuttals;
  if (rbClose) {
    const used = safe(rbClose?.counts?.used) || safe(rbClose?.used?.length);
    const missed = safe(rbClose?.counts?.missed) || safe(rbClose?.missed?.length);
    k.close_reb_used += used;
    k.close_reb_seen += used + missed;
    k.missed_reb_total += missed;
  }

  // discovery / talk / hold
  if (typeof a?.questions_first_minute === "number") {
    k.q_first_minute.push(a.questions_first_minute);
  }

  const ratio = a?.talk_metrics?.talk_ratio_agent ?? a?.talk_metrics?.agent_ratio ?? a?.talk_ratio_agent;
  if (typeof ratio === "number" && Number.isFinite(ratio)) {
    k.talk_ratio_agent.push(ratio);
  }

  const holdSec = a?.hold?.hold_time_sec ?? a?.hold?.total_sec;
  if (typeof holdSec === "number" && holdSec >= 60) {
    k.holds_over60 += 1;
  }

  // price change flag
  if (a?.price_change === true) k.price_changed_calls += 1;

  // wasted
  if (a?.wasted_call === true) k.wasted_calls += 1;

  // callbacks
  if (a?.signals?.callback_set === true || a?.callback_set === true) {
    k.callbacks_set += 1;
  }

  return k;
}

export function finalize(k: KPISnapshot) {
  const avg_ticket = k.premium_cents_count ? (k.premium_cents_sum / k.premium_cents_count) / 100 : 0;
  const avg_applied_discount_cents = k.discounted_cases ? Math.round(k.discount_cents_sum / k.discounted_cases) : 0;

  return {
    // raw counts
    totals: {
      handled: k.handled,
      contacts: k.contacts,
      sales: k.sales,
      post_dates: k.post_dates,
      closes_inbound: k.closes_inbound,
      closes_outbound: k.closes_outbound,
      wasted_calls: k.wasted_calls,
      discounted_cases: k.discounted_cases,
    },

    // rates
    rates: {
      close_rate: pct(k.sales, k.handled),
      post_date_rate: pct(k.post_dates, k.handled),
      enroll_fee_rate: pct(k.enroll_fee_sales, Math.max(1, k.sales + k.post_dates)),
      callback_set_rate: pct(k.callbacks_set, k.contacts),
      opening_rebuttal_usage: pct(k.open_reb_used, Math.max(1, k.open_reb_seen)),
      closing_rebuttal_usage: pct(k.close_reb_used, Math.max(1, k.close_reb_seen)),
      hold_time_rate: pct(k.holds_over60, k.handled),
      price_change_rate: pct(k.price_changed_calls, k.handled),
      wasted_rate: pct(k.wasted_calls, k.handled),
    },

    // averages/medians
    averages: {
      avg_ticket,
      avg_applied_discount_cents,
      missed_rebuttals_per_call: k.handled ? k.missed_reb_total / k.handled : 0,
      questions_first_minute: median(k.q_first_minute),
      talk_ratio_agent: median(k.talk_ratio_agent),
    },
  };
}