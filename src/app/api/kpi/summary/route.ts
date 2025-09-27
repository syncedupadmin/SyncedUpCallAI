import { NextRequest, NextResponse } from "next/server";
import { withStrictAgencyIsolation } from "@/lib/security/agency-isolation";
import { sbAdmin } from "@/lib/supabase-admin";

function yesterdayUTC() {
  const d = new Date(Date.now() - 86400000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString().slice(0,10);
}

function lastMondayUTC() {
  const d = new Date();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - day + 1);  // Monday this week
  return t.toISOString().slice(0,10);
}

export const GET = withStrictAgencyIsolation(async (req, context) => {
  const { searchParams } = new URL(req.url);
  const requestedAgencyId = searchParams.get("agencyId");

  if (!requestedAgencyId) {
    return NextResponse.json({ error: "agencyId required" }, { status: 400 });
  }

  // SECURITY: Validate user has access to requested agency
  if (!context.agencyIds.includes(requestedAgencyId)) {
    console.error(`[SECURITY] User ${context.userId} attempted to access KPI for agency ${requestedAgencyId} without permission`);
    return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  }

  const day = yesterdayUTC();
  const week_start = lastMondayUTC();

  const [baseline, daily, weekly] = await Promise.all([
    sbAdmin.rpc("get_kpi_baseline", { p_agency: requestedAgencyId }),
    sbAdmin.from("kpi_daily_agency").select("payload").eq("agency_id", requestedAgencyId).eq("day", day).maybeSingle(),
    sbAdmin.from("kpi_weekly_agency").select("payload").eq("agency_id", requestedAgencyId).eq("week_start", week_start).maybeSingle(),
  ]);

  if (baseline.error) {
    console.error(`[SECURITY] KPI baseline error for user ${context.userId}:`, baseline.error);
    return NextResponse.json({ error: baseline.error.message }, { status: 500 });
  }
  if (daily.error) {
    console.error(`[SECURITY] KPI daily error for user ${context.userId}:`, daily.error);
    return NextResponse.json({ error: daily.error.message }, { status: 500 });
  }
  if (weekly.error) {
    console.error(`[SECURITY] KPI weekly error for user ${context.userId}:`, weekly.error);
    return NextResponse.json({ error: weekly.error.message }, { status: 500 });
  }

  return NextResponse.json({
    day,
    week_start,
    baseline: baseline.data ?? null,
    daily: daily.data?.payload ?? null,
    weekly: weekly.data?.payload ?? null,
  });
});