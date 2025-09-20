import { NextRequest, NextResponse } from "next/server";
import { sbAdmin } from "@/lib/supabase-admin";
import { addCall, finalize, makeEmpty } from "@/lib/kpi/reducer";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/kpi-baseline?agencyId=UUID&limit=10000
 * Computes baseline from the earliest N analyzed calls for an agency and
 * inserts a frozen payload into public.kpi_baselines.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agencyId = searchParams.get("agencyId");
    const limit = Number(searchParams.get("limit") ?? "10000");

    if (!agencyId) {
      return NextResponse.json({ error: "Missing agencyId" }, { status: 400 });
    }

    // Check if baseline already exists
    const { data: existing } = await sbAdmin
      .from("kpi_baselines")
      .select("agency_id")
      .eq("agency_id", agencyId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        message: "Baseline already exists",
        agency_id: agencyId
      });
    }

    // Pull earliest analyzed calls (ordered by analyzed_at)
    const { data, error } = await sbAdmin
      .from("calls")
      .select("analysis_json, analyzed_at")
      .eq("agency_id", agencyId)
      .not("analysis_json", "is", null)
      .order("analyzed_at", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("Error fetching calls:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        message: "No calls found for baseline",
        agency_id: agencyId
      });
    }

    // Compute KPIs using reducer
    const k = makeEmpty();
    for (const row of data) {
      addCall(k, row.analysis_json || {});
    }
    const payload = finalize(k);

    // Get window range
    const window_start = data[0].analyzed_at;
    const window_end = data[data.length - 1].analyzed_at;

    // Insert baseline
    const { error: insErr } = await sbAdmin
      .from("kpi_baselines")
      .insert({
        agency_id: agencyId,
        window_start,
        window_end,
        sample_size: data.length,
        payload
      });

    if (insErr) {
      console.error("Error inserting baseline:", insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      agency_id: agencyId,
      calls_used: data.length,
      window_start,
      window_end,
      payload
    });

  } catch (error: any) {
    console.error("Baseline computation error:", error);
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