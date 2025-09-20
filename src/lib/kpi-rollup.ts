// KPI rollup function for aggregating all metrics
import type { Segment } from "./asr-nova2";
import { computeTalkMetrics, computeHoldStats, isWastedCall } from "./metrics";
import { extractPriceTimeline, detectPriceChanges } from "./price-events";
import { computeSignals } from "./rules-engine";

export type KPIMetrics = {
  // Talk metrics
  talk_time_agent_sec: number;
  talk_time_customer_sec: number;
  silence_time_sec: number;
  interrupt_count: number;
  questions_first_minute: number;
  talk_ratio_agent: number;

  // Hold metrics
  hold_time_sec: number;
  hold_events: number;
  holds: Array<{
    startMs: number;
    endMs: number;
    type: "system_hold" | "explicit_hold" | "silence_hold";
    reason?: string;
  }>;
  hold_breakdown?: {
    system_holds: number;
    explicit_holds: number;
    silence_holds: number;
    system_hold_sec: number;
    explicit_hold_sec: number;
    silence_hold_sec: number;
  };

  // Price tracking
  price_change: boolean;
  final_premium_cents: number | null;
  discount_cents_total: number | null;
  enroll_fee_mentioned: boolean;
  price_timeline: Array<{
    ms: number;
    amount_cents: number;
    kind: "premium" | "enroll_fee" | "discount" | "enrollment_fee" | "waive_fee" | "price_drop" | "quoted_premium";
    speaker?: "agent" | "customer";
  }>;

  // Call quality
  wasted_call: boolean;

  // Signals
  callback_set: boolean;
  call_type: "outbound" | "inbound" | "transfer" | "unknown";
  card_spoken: boolean;
  card_last4: string | null;
  esign_sent: boolean;
  esign_confirmed: boolean;
  sale_confirm_phrase: boolean;
  post_date_phrase: boolean;

  // Rebuttals
  opening_rebuttals_used: number;
  opening_rebuttals_missed: number;
  money_rebuttals_used: number;
  money_rebuttals_missed: number;
  asked_for_card_after_last_rebuttal: boolean;
};

export function computeKPIRollup(segments: Segment[]): KPIMetrics {
  // Compute all metrics
  const talk = computeTalkMetrics(segments);
  const hold = computeHoldStats(segments);
  const wasted = isWastedCall(talk, segments);
  const ptl = extractPriceTimeline(segments);
  const pc = detectPriceChanges(ptl);
  const signals = computeSignals(segments);

  return {
    // Talk metrics
    talk_time_agent_sec: talk.talk_time_agent_sec,
    talk_time_customer_sec: talk.talk_time_customer_sec,
    silence_time_sec: talk.silence_time_sec,
    interrupt_count: talk.interrupt_count,
    questions_first_minute: talk.questions_first_minute,
    talk_ratio_agent: talk.talk_ratio_agent,

    // Hold metrics
    hold_time_sec: hold.hold_time_sec,
    hold_events: hold.hold_events,
    holds: hold.holds,
    hold_breakdown: hold.hold_breakdown,

    // Price tracking
    price_change: pc.price_change,
    final_premium_cents: pc.final_premium_cents,
    discount_cents_total: pc.discount_cents_total,
    enroll_fee_mentioned: pc.enroll_fee_mentioned,
    price_timeline: ptl,

    // Call quality
    wasted_call: wasted,

    // Signals
    callback_set: signals.callback_set,
    call_type: signals.call_type,
    card_spoken: signals.card_spoken,
    card_last4: signals.card_last4,
    esign_sent: signals.esign_sent,
    esign_confirmed: signals.esign_confirmed,
    sale_confirm_phrase: signals.sale_confirm_phrase,
    post_date_phrase: signals.post_date_phrase,

    // Rebuttals (from signals)
    opening_rebuttals_used: signals.opening_rebuttals_used.length,
    opening_rebuttals_missed: signals.opening_rebuttals_missed.length,
    money_rebuttals_used: signals.rebuttals_used.length,
    money_rebuttals_missed: signals.rebuttals_missed.length,
    asked_for_card_after_last_rebuttal: signals.asked_for_card_after_last_rebuttal
  };
}

// Helper to format KPIs for display/reporting
export function formatKPISummary(kpi: KPIMetrics): string {
  const lines: string[] = [];

  // Talk time summary
  lines.push(`📞 Call Metrics:`);
  lines.push(`  • Agent talk: ${kpi.talk_time_agent_sec}s (${(kpi.talk_ratio_agent * 100).toFixed(0)}%)`);
  lines.push(`  • Customer talk: ${kpi.talk_time_customer_sec}s`);
  lines.push(`  • Silence: ${kpi.silence_time_sec}s`);
  if (kpi.hold_events > 0) {
    lines.push(`  • Hold time: ${kpi.hold_time_sec}s (${kpi.hold_events} events)`);
  }

  // Discovery
  lines.push(`\n🔍 Discovery:`);
  lines.push(`  • Questions in first minute: ${kpi.questions_first_minute}`);
  lines.push(`  • Interruptions: ${kpi.interrupt_count}`);

  // Rebuttals
  lines.push(`\n💬 Rebuttals:`);
  lines.push(`  • Opening: ${kpi.opening_rebuttals_used} used, ${kpi.opening_rebuttals_missed} missed`);
  lines.push(`  • Money/Close: ${kpi.money_rebuttals_used} used, ${kpi.money_rebuttals_missed} missed`);
  if (kpi.money_rebuttals_used > 0) {
    lines.push(`  • Asked for card after rebuttal: ${kpi.asked_for_card_after_last_rebuttal ? '✅' : '❌'}`);
  }

  // Pricing
  if (kpi.final_premium_cents !== null) {
    lines.push(`\n💰 Pricing:`);
    lines.push(`  • Premium: $${(kpi.final_premium_cents / 100).toFixed(2)}/month`);
    if (kpi.discount_cents_total) {
      lines.push(`  • Discount: $${(kpi.discount_cents_total / 100).toFixed(2)}`);
    }
    if (kpi.price_change) {
      lines.push(`  • ⚠️ Price changed during call`);
    }
  }

  // Outcome signals
  lines.push(`\n📊 Outcome Signals:`);
  lines.push(`  • Call type: ${kpi.call_type}`);
  if (kpi.card_spoken) {
    lines.push(`  • Card provided: Yes (***${kpi.card_last4})`);
  }
  if (kpi.esign_sent) {
    lines.push(`  • E-sign: Sent${kpi.esign_confirmed ? ' & Confirmed' : ''}`);
  }
  if (kpi.sale_confirm_phrase) {
    lines.push(`  • Sale confirmed: Yes`);
  }
  if (kpi.post_date_phrase) {
    lines.push(`  • Post-date scheduled: Yes`);
  }
  if (kpi.callback_set) {
    lines.push(`  • Callback scheduled: Yes`);
  }

  // Quality flags
  if (kpi.wasted_call) {
    lines.push(`\n⚠️ WASTED CALL - Agent provided minimal content`);
  }

  return lines.join('\n');
}