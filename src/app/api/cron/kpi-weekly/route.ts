import { NextRequest, NextResponse } from "next/server";
import { sbAdmin } from "@/lib/supabase-admin";
import { addCall, finalize, makeEmpty } from "@/lib/kpi/reducer";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/kpi-weekly?week_start=YYYY-MM-DD
 * Rolls up all calls for the ISO week (UTC). Default: last week's Monday (UTC).
 */
function lastMondayUTC(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; // 1..7 (Mon=1)
  t.setUTCDate(t.getUTCDate() - day + 1 - 7); // previous week Monday
  return t.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const week_start = searchParams.get("week_start") || lastMondayUTC();

    // Calculate week end (Sunday)
    const weekStartDate = new Date(week_start);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const week_end = weekEndDate.toISOString().slice(0, 10);

    console.log(`Running weekly KPI rollup for week ${week_start} to ${week_end}`);

    // Pull calls for the week using date range
    const { data, error } = await sbAdmin
      .from("calls")
      .select("agency_id, agent_id, analysis_json, analyzed_day")
      .gte("analyzed_day", week_start)
      .lte("analyzed_day", week_end);

    if (error) {
      console.error("Error fetching calls:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      console.log(`No calls found for week ${week_start}`);
      return NextResponse.json({
        message: "No calls to process",
        week_start,
        week_end,
        processed: 0
      });
    }

    // Rollup per agency and per agent
    const byAgency = new Map<string, ReturnType<typeof makeEmpty>>();
    const byAgent = new Map<string, ReturnType<typeof makeEmpty>>();

    for (const row of data) {
      const aId = row.agency_id as string | null;
      const gId = row.agent_id as string | null;
      if (!aId) continue;

      // Agency rollup
      if (!byAgency.has(aId)) byAgency.set(aId, makeEmpty());
      addCall(byAgency.get(aId)!, row.analysis_json || {});

      // Agent rollup
      if (gId) {
        const key = `${aId}::${gId}`;
        if (!byAgent.has(key)) byAgent.set(key, makeEmpty());
        addCall(byAgent.get(key)!, row.analysis_json || {});
      }
    }

    // Upsert agency rows
    const agencyUpserts = [];
    for (const [agency_id, k] of byAgency.entries()) {
      const payload = finalize(k);
      agencyUpserts.push({
        agency_id,
        week_start,
        n_calls: k.handled,
        payload
      });
    }

    if (agencyUpserts.length > 0) {
      const { error: agencyError } = await sbAdmin
        .from("kpi_weekly_agency")
        .upsert(agencyUpserts, { onConflict: "agency_id,week_start" });

      if (agencyError) {
        console.error("Error upserting agency weekly rollups:", agencyError);
        return NextResponse.json({ error: agencyError.message }, { status: 500 });
      }
    }

    // Upsert agent rows
    const agentUpserts = [];
    for (const [key, k] of byAgent.entries()) {
      const [agency_id, agent_id] = key.split("::");
      const payload = finalize(k);
      agentUpserts.push({
        agency_id,
        agent_id,
        week_start,
        n_calls: k.handled,
        payload
      });
    }

    if (agentUpserts.length > 0) {
      const { error: agentError } = await sbAdmin
        .from("kpi_weekly_agent")
        .upsert(agentUpserts, { onConflict: "agency_id,agent_id,week_start" });

      if (agentError) {
        console.error("Error upserting agent weekly rollups:", agentError);
        return NextResponse.json({ error: agentError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      week_start,
      week_end,
      agencies: byAgency.size,
      agents: byAgent.size,
      calls: data.length,
    });

  } catch (error: any) {
    console.error("Weekly KPI rollup error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST endpoint for Vercel Cron
export async function POST(req: NextRequest) {
  return GET(req);
}