import { NextRequest, NextResponse } from "next/server";
import { sbAdmin } from "@/lib/supabase-admin";
import { addCall, finalize, makeEmpty } from "@/lib/kpi/reducer";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/kpi-daily?date=YYYY-MM-DD
 * Rolls up all calls for that UTC day into kpi_daily_agency and kpi_daily_agent.
 * Default: "yesterday" (UTC).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const day = searchParams.get("date") || new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    console.log(`Running daily KPI rollup for ${day}`);

    // Fetch all calls for that day
    const { data, error } = await sbAdmin
      .from("calls")
      .select("agency_id, agent_id, analysis_json")
      .eq("analyzed_day", day);

    if (error) {
      console.error("Error fetching calls:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      console.log(`No calls found for ${day}`);
      return NextResponse.json({
        message: "No calls to process",
        day,
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
        day,
        n_calls: k.handled,
        payload
      });
    }

    if (agencyUpserts.length > 0) {
      const { error: agencyError } = await sbAdmin
        .from("kpi_daily_agency")
        .upsert(agencyUpserts, { onConflict: "agency_id,day" });

      if (agencyError) {
        console.error("Error upserting agency rollups:", agencyError);
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
        day,
        n_calls: k.handled,
        payload
      });
    }

    if (agentUpserts.length > 0) {
      const { error: agentError } = await sbAdmin
        .from("kpi_daily_agent")
        .upsert(agentUpserts, { onConflict: "agency_id,agent_id,day" });

      if (agentError) {
        console.error("Error upserting agent rollups:", agentError);
        return NextResponse.json({ error: agentError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      day,
      agencies: byAgency.size,
      agents: byAgent.size,
      calls: data.length,
    });

  } catch (error: any) {
    console.error("Daily KPI rollup error:", error);
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