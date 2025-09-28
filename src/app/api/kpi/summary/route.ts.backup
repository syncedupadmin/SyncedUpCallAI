import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agencyId = searchParams.get("agencyId");
  if (!agencyId) return NextResponse.json({ error: "agencyId required" }, { status: 400 });

  const day = yesterdayUTC();
  const week_start = lastMondayUTC();

  const [baseline, daily, weekly] = await Promise.all([
    sbAdmin.rpc("get_kpi_baseline", { p_agency: agencyId }),
    sbAdmin.from("kpi_daily_agency").select("payload").eq("agency_id", agencyId).eq("day", day).maybeSingle(),
    sbAdmin.from("kpi_weekly_agency").select("payload").eq("agency_id", agencyId).eq("week_start", week_start).maybeSingle(),
  ]);

  if (baseline.error) return NextResponse.json({ error: baseline.error.message }, { status: 500 });
  if (daily.error)    return NextResponse.json({ error: daily.error.message }, { status: 500 });
  if (weekly.error)   return NextResponse.json({ error: weekly.error.message }, { status: 500 });

  return NextResponse.json({
    day,
    week_start,
    baseline: baseline.data ?? null,
    daily: daily.data?.payload ?? null,
    weekly: weekly.data?.payload ?? null,
  });
}