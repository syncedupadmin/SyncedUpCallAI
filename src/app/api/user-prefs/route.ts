import { NextResponse } from "next/server";
import { DEFAULT_PREFS } from "@/lib/prefs";

export async function GET() {
  // TODO: read from your DB by user/org
  return NextResponse.json(DEFAULT_PREFS);
}

export async function POST(req: Request) {
  const body = await req.json();
  // TODO: validate + persist to DB
  return NextResponse.json({ ok: true });
}