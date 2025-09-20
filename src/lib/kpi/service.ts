import { createClient } from "@supabase/supabase-js";
import { computeAgencyKPIFromCalls } from "./baseline";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function insertBaselineIfMissing(agencyId: string, nTarget = 10000) {
  // Check if baseline already exists for this agency
  const { data: existing } = await supabase
    .from("kpi_baselines")
    .select("agency_id")
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (existing) return;

  // Try to fetch using RPC first, fallback to direct query
  let calls: any[] | null = null;

  try {
    const { data: rows } = await supabase.rpc("fetch_calls_for_baseline", {
      p_agency_id: agencyId,
      p_n: nTarget
    });
    calls = rows;
  } catch (e) {
    // RPC doesn't exist, use fallback
  }

  // Fallback if RPC doesn't exist or returned null
  if (!calls) {
    const { data } = await supabase
      .from("calls")
      .select("*")
      .eq("agency_id", agencyId)
      .not("analyzed_at", "is", null)
      .order("analyzed_at", { ascending: true })
      .limit(nTarget);
    calls = data;
  }

  if (!calls?.length) return;

  const windowStart = calls[0].analyzed_at;
  const windowEnd = calls[calls.length - 1].analyzed_at;
  const payload = await computeAgencyKPIFromCalls(calls);

  // Upsert with proper conflict resolution
  await supabase
    .from("kpi_baselines")
    .upsert({
      agency_id: agencyId,
      window_start: windowStart,
      window_end: windowEnd,
      sample_size: calls.length,
      payload
    }, { onConflict: "agency_id,window_start,window_end" });
}

export async function compareToBaseline(agencyId: string, current: Record<string, number>) {
  const { data: base } = await supabase
    .from("kpi_baselines")
    .select("payload")
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (!base?.payload) return null;

  const diffs: Record<string, { baseline: number; current: number; delta: number; pct_change: number }> = {};

  for (const k of Object.keys(base.payload)) {
    const b = Number(base.payload[k] ?? 0);
    const c = Number(current[k] ?? 0);
    const delta = c - b;
    const pct_change = b !== 0 ? (delta / b) * 100 : 0;

    diffs[k] = {
      baseline: b,
      current: c,
      delta,
      pct_change: Math.round(pct_change * 100) / 100
    };
  }

  return diffs;
}

export async function writeDailyAgencyKPI(agencyId: string, day: string) {
  const { data: rows } = await supabase
    .from("calls")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("analyzed_day", day);

  const payload = await computeAgencyKPIFromCalls(rows || []);

  await supabase
    .from("kpi_daily_agency")
    .upsert({
      agency_id: agencyId,
      day,
      payload,
      n_calls: rows?.length || 0
    }, { onConflict: "agency_id,day" });
}

export async function writeAgentDailyKPI(agentId: string, agencyId: string, day: string) {
  const { data: rows } = await supabase
    .from("calls")
    .select("*")
    .eq("agent_id", agentId)
    .eq("agency_id", agencyId)
    .eq("analyzed_day", day);

  const payload = await computeAgencyKPIFromCalls(rows || []);

  await supabase
    .from("kpi_daily_agent")
    .upsert({
      agency_id: agencyId,
      agent_id: agentId,
      day,
      payload,
      n_calls: rows?.length || 0
    }, { onConflict: "agency_id,agent_id,day" });
}

// Helper to get KPI trends over time
export async function getKPITrends(agencyId: string, startDate: string, endDate: string) {
  const { data: daily } = await supabase
    .from("kpi_daily_agency")
    .select("day, payload")
    .eq("agency_id", agencyId)
    .gte("day", startDate)
    .lte("day", endDate)
    .order("day");

  return daily || [];
}

// Helper to rank agents by KPI
export async function rankAgentsByKPI(agencyId: string, day: string, metric: string = "close_rate") {
  const { data: agentKPIs } = await supabase
    .from("kpi_daily_agent")
    .select("agent_id, payload")
    .eq("agency_id", agencyId)
    .eq("day", day);

  if (!agentKPIs) return [];

  return agentKPIs
    .map(a => ({
      agent_id: a.agent_id,
      value: a.payload[metric] || 0
    }))
    .sort((a, b) => b.value - a.value);
}